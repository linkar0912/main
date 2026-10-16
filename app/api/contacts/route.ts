import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { MetaClient } from "@/src/lib/meta/client";
import { hasCachedInstagramAvatar, instagramIdentityKey, resolveInstagramUsernames } from "@/src/lib/meta/username-resolver";
import { LEAD_STATUSES, type ContactReconcileCandidate, type ContactSearch, type LeadStatus } from "@/src/lib/repository";
import { decodeInboxCursor, encodeInboxCursor } from "@/src/lib/inbox-cursor";

export const runtime = "nodejs";

const CONTACT_RECONCILIATION_LIMIT = 500;
const MAX_QUERY_LENGTH = 100;

// The backfill reads 1,000 rows and writes up to 1,000 contacts, and every
// teammate's browser asks for it. The web app runs as a single replica, so an
// in-process map is enough to run it at most once per workspace per window,
// however many tabs, reloads or teammates ask in the meantime.
const RECONCILE_COOLDOWN_MS = 15 * 60_000;
const reconcileStartedAt = new Map<string, number>();

/** True when this workspace may run the backfill now; claims the window if so. */
function claimReconcileWindow(workspaceId: string, now = Date.now()): boolean {
  const last = reconcileStartedAt.get(workspaceId);
  if (last !== undefined && now - last < RECONCILE_COOLDOWN_MS) return false;
  if (reconcileStartedAt.size >= 1_000) {
    for (const [key, startedAt] of reconcileStartedAt) {
      if (now - startedAt >= RECONCILE_COOLDOWN_MS) reconcileStartedAt.delete(key);
    }
  }
  // Claimed before the work starts, and kept when it fails, so neither a
  // second tab nor a retry during a database incident repeats it.
  reconcileStartedAt.set(workspaceId, now);
  return true;
}

export async function POST(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!claimReconcileWindow(session.workspaceId)) return NextResponse.json({ data: { reconciled: 0 } });

  const repository = getRepository();
  const [participants, events] = await Promise.all([
    repository.listRecentParticipants(session.workspaceId, CONTACT_RECONCILIATION_LIMIT),
    repository.listRecentWebhookEvents(session.workspaceId, CONTACT_RECONCILIATION_LIMIT),
  ]);
  const candidates = new Map<string, ContactReconcileCandidate>();
  for (const participant of participants) {
    if (!participant.igScopedUserId) continue;
    const key = `${participant.instagramAccountId}:${participant.igScopedUserId}`;
    candidates.set(key, {
      instagramAccountId: participant.instagramAccountId,
      igScopedUserId: participant.igScopedUserId,
      firstSeenAt: participant.updatedAt,
      lastSeenAt: participant.updatedAt,
    });
  }
  for (const event of events) {
    if (event.eventType.startsWith("facebook.")) continue;
    const instagramAccountId = typeof event.payload.accountId === "string" ? event.payload.accountId : undefined;
    const igScopedUserId = typeof event.payload.recipientId === "string" ? event.payload.recipientId : undefined;
    if (!instagramAccountId || !igScopedUserId) continue;
    const key = `${instagramAccountId}:${igScopedUserId}`;
    const current = candidates.get(key);
    candidates.set(key, {
      instagramAccountId,
      igScopedUserId,
      firstSeenAt: current && current.firstSeenAt < event.receivedAt ? current.firstSeenAt : event.receivedAt,
      lastSeenAt: current && current.lastSeenAt > event.receivedAt ? current.lastSeenAt : event.receivedAt,
    });
  }

  // One statement for every candidate. touchContact used to run up to twice
  // per candidate (about 4,000 statements on 10 pooled connections), and it
  // reopened conversations someone had closed; reconcileContacts only creates
  // missing contacts and widens the first and last seen dates.
  const reconciled = await repository.reconcileContacts(session.workspaceId, [...candidates.values()]);
  return NextResponse.json({ data: { reconciled } });
}

// Emails captured by DM email-capture flows, newest first. Session-guarded so the
// audience list is only ever visible inside the workspace.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
  const repository = getRepository();
  if (url.searchParams.get("scope") === "all") {
    const leadStatusParam = url.searchParams.get("leadStatus");
    if (leadStatusParam && !(LEAD_STATUSES as readonly string[]).includes(leadStatusParam)) {
      return NextResponse.json({ error: "Invalid lead status" }, { status: 400 });
    }
    const leadStatus = leadStatusParam as LeadStatus | null;
    const offsetParam = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
    const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;
    // `cursor` (keyed on lastSeenAt + id) is stable while contacts are touched
    // or move between stages; `offset` stays for existing clients.
    const cursorParam = url.searchParams.get("cursor");
    let after: { lastSeenAt: string; id: string } | undefined;
    if (cursorParam) {
      try {
        const decoded = decodeInboxCursor(cursorParam, "directory");
        after = { lastSeenAt: decoded.at, id: decoded.id };
      } catch {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
    }
    // `q` searches the whole workspace on the server (handle, email, tag, or
    // the owner's email) - the Contacts page and the palette used to filter
    // only the newest 200 rows in the browser. Counts follow the search.
    const text = (url.searchParams.get("q") ?? "").trim().replace(/^@+/, "").slice(0, MAX_QUERY_LENGTH);
    let search: ContactSearch | undefined;
    if (text) {
      const needle = text.toLowerCase();
      const owners = (await repository.listMembers(session.workspaceId))
        .flatMap((member) => (member.userId && member.email.toLowerCase().includes(needle) ? [member.userId] : []));
      search = { text, ...(owners.length ? { assigneeUserIds: owners } : {}) };
    }
    const [counts, page, events] = await Promise.all([
      repository.countContactsByLeadStatus(session.workspaceId, search),
      repository.listContactsByLeadStatus(session.workspaceId, {
        ...(leadStatus ? { leadStatus } : {}),
        ...(search ? { search } : {}),
        // One extra row says whether another page exists without trusting a
        // count that may have moved since.
        limit: limit + 1,
        ...(after ? { after } : { offset }),
      }),
      repository.listRecentWebhookEvents(session.workspaceId, CONTACT_RECONCILIATION_LIMIT),
    ]);
    const contacts = page.slice(0, limit);
    const lastContact = contacts.at(-1);
    const nextCursor = page.length > limit && lastContact
      ? encodeInboxCursor({ kind: "directory", at: lastContact.lastSeenAt, id: lastContact.id })
      : undefined;
    const env = getServerEnv();
    const enrich = url.searchParams.get("enrich") === "1";
    const connections = enrich && env.metaTokenEncryptionKey && contacts.length
      ? await repository.listConnections(session.workspaceId)
      : [];
    const usernames = await resolveInstagramUsernames({
      identities: contacts,
      events,
      connections,
      apiVersion: env.metaApiVersion,
      ...(enrich && env.metaTokenEncryptionKey ? {
        client: new MetaClient({ apiVersion: env.metaApiVersion }),
        tokenEncryptionKey: env.metaTokenEncryptionKey,
        remember: (entries) => repository.rememberContactUsernames(session.workspaceId, entries),
      } : {}),
    });
    const needsProfileEnrichment = !enrich && Boolean(env.metaTokenEncryptionKey)
      && contacts.some((contact) => !usernames.has(instagramIdentityKey(contact)));
    return NextResponse.json({
      data: {
        count: Object.values(counts).reduce((sum, value) => sum + value, 0),
        counts,
        ...(search ? { query: search.text } : {}),
        offset,
        hasMore: page.length > limit,
        ...(nextCursor ? { nextCursor } : {}),
        needsProfileEnrichment,
        contacts: contacts.map((contact) => ({
          id: contact.id,
          instagramUsername: usernames.get(instagramIdentityKey(contact)),
          avatarUrl: hasCachedInstagramAvatar(contact, env.metaApiVersion) ? `/api/contacts/${contact.id}/avatar` : undefined,
          instagramAccountId: contact.instagramAccountId,
          igScopedUserId: contact.igScopedUserId,
          email: contact.email,
          state: contact.state,
          tags: contact.tags,
          score: contact.score,
          leadStatus: contact.leadStatus,
          assigneeUserId: contact.assigneeUserId,
          sourceAutomationId: contact.sourceAutomationId,
          suppressedAt: contact.suppressedAt,
          lastSeenAt: contact.lastSeenAt,
          createdAt: contact.createdAt,
        })),
      },
    });
  }
  const [count, contacts] = await Promise.all([
    repository.countCapturedContacts(session.workspaceId),
    repository.listCapturedContacts(session.workspaceId, limit),
  ]);
  return NextResponse.json({ data: { count, contacts } });
}
