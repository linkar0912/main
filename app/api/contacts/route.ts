import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { MetaClient } from "@/src/lib/meta/client";
import { instagramIdentityKey, resolveInstagramUsernames } from "@/src/lib/meta/username-resolver";
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

  let reconciled = 0;
  for (const candidate of candidates.values()) {
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
    if (touched.created) reconciled += 1;
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
    const connections = env.metaTokenEncryptionKey && contacts.length
      ? await repository.listConnections(session.workspaceId)
      : [];
    const usernames = await resolveInstagramUsernames({
      identities: contacts,
      events,
      connections,
      ...(env.metaTokenEncryptionKey ? {
        client: new MetaClient({ apiVersion: env.metaApiVersion }),
        tokenEncryptionKey: env.metaTokenEncryptionKey,
      } : {}),
    });
    return NextResponse.json({
      data: {
        count: Object.values(counts).reduce((sum, value) => sum + value, 0),
        counts,
        contacts: contacts.map((contact) => ({
          id: contact.id,
          instagramUsername: usernames.get(instagramIdentityKey(contact)),
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
