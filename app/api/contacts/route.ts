import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { MetaClient } from "@/src/lib/meta/client";
import { hasCachedInstagramAvatar, instagramIdentityKey, resolveInstagramUsernames } from "@/src/lib/meta/username-resolver";
import { LEAD_STATUSES, type LeadStatus } from "@/src/lib/repository";

export const runtime = "nodejs";

const CONTACT_RECONCILIATION_LIMIT = 500;

export async function POST(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const repository = getRepository();
  const [participants, events] = await Promise.all([
    repository.listRecentParticipants(session.workspaceId, CONTACT_RECONCILIATION_LIMIT),
    repository.listRecentWebhookEvents(session.workspaceId, CONTACT_RECONCILIATION_LIMIT),
  ]);
  const candidates = new Map<string, {
    instagramAccountId: string;
    igScopedUserId: string;
    firstSeenAt: string;
    lastSeenAt: string;
  }>();
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

  // Batched concurrency instead of one contact per round trip: up to 500
  // candidates × 2 touches used to serialize into ~1 000 sequential DB calls,
  // and the list fetch waited on all of them. Candidates are distinct
  // (Map-keyed), so concurrent touches can't collide.
  const RECONCILE_BATCH = 10;
  const candidateList = [...candidates.values()];
  let reconciled = 0;
  for (let index = 0; index < candidateList.length; index += RECONCILE_BATCH) {
    const batch = await Promise.all(candidateList.slice(index, index + RECONCILE_BATCH).map(async (candidate) => {
      const touched = await repository.touchContact(
        session.workspaceId,
        candidate.instagramAccountId,
        candidate.igScopedUserId,
        candidate.firstSeenAt,
      );
      if (candidate.lastSeenAt !== candidate.firstSeenAt) {
        await repository.touchContact(
          session.workspaceId,
          candidate.instagramAccountId,
          candidate.igScopedUserId,
          candidate.lastSeenAt,
        );
      }
      return touched;
    }));
    reconciled += batch.filter((touched) => touched.created).length;
  }
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
    const [counts, contacts, events] = await Promise.all([
      repository.countContactsByLeadStatus(session.workspaceId),
      repository.listContactsByLeadStatus(session.workspaceId, {
        ...(leadStatus ? { leadStatus } : {}),
        limit,
      }),
      repository.listRecentWebhookEvents(session.workspaceId, CONTACT_RECONCILIATION_LIMIT),
    ]);
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
      } : {}),
    });
    const needsProfileEnrichment = !enrich && Boolean(env.metaTokenEncryptionKey)
      && contacts.some((contact) => !usernames.has(instagramIdentityKey(contact)));
    return NextResponse.json({
      data: {
        count: Object.values(counts).reduce((sum, value) => sum + value, 0),
        counts,
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
