import { NextResponse } from "next/server";
import { z } from "zod";
import { MANUAL_REPLY_PAUSE_MS, MANUAL_REPLY_REASON } from "@/src/lib/automation/manual-reply";
import { executeOutboundDelivery } from "@/src/lib/automation/outbound-delivery";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { EntitlementError } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse } from "@/src/lib/entitlements/http";
import { createId } from "@/src/lib/id";
import { logger } from "@/src/lib/logger";
import { decodeInboxCursor, encodeInboxCursor } from "@/src/lib/inbox-cursor";
import { buildConversation } from "@/src/lib/inbox";
import { isWithinMessagingWindow } from "@/src/lib/messaging-window";
import { MetaClient } from "@/src/lib/meta/client";
import type { MetaMessage } from "@/src/lib/meta/types";
import { getRepository } from "@/src/lib/repository-provider";
import { unsealSecret } from "@/src/lib/security/secrets";

export const runtime = "nodejs";
const MAX_MESSAGE_LENGTH = 1_000;
const getQuerySchema = z.object({ cursor: z.string().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark_read") }).strict(),
  z.object({ action: z.literal("set_status"), status: z.enum(["OPEN", "CLOSED"]) }).strict(),
  z.object({ action: z.literal("set_favorite"), favorite: z.boolean() }).strict(),
  z.object({ action: z.literal("set_reminder"), reminderAt: z.iso.datetime({ offset: true }).nullable() }).strict(),
  z.object({ action: z.literal("set_assignment"), assigneeUserId: z.string().trim().min(1).max(128).nullable() }).strict(),
]);
type Context = { params: Promise<{ contactId: string }> };

// The merged conversation is ordered (at DESC, id DESC). At one timestamp
// every `wevent_` id sorts above every `delivery_` id, so a page boundary on
// a delivery row has already shown all inbound rows of that millisecond, and
// a boundary on an inbound row has shown none of that millisecond's
// deliveries. The repositories apply an id tie-break only when the cursor id
// carries their own prefix, so the other table gets one of two sentinels:
//   "~"        - no tie-break: keep every row at the boundary timestamp.
//   "wevent_"  - a bare prefix sorts below every real wevent id, so the
//                tie-break drops every inbound row at the boundary timestamp.
const INCLUDE_BOUNDARY_ROWS = "~";
const EXCLUDE_INBOUND_BOUNDARY_ROWS = "wevent_";

function scopedMessageCursors(cursor: string): { outbound: string; inbound: string } {
  try {
    const decoded = decodeInboxCursor(cursor, "messages");
    if (decoded.id.startsWith("delivery_")) {
      return {
        outbound: cursor,
        inbound: encodeInboxCursor({ kind: "messages", at: decoded.at, id: EXCLUDE_INBOUND_BOUNDARY_ROWS }),
      };
    }
    if (decoded.id.startsWith("wevent_")) {
      return {
        outbound: encodeInboxCursor({ kind: "messages", at: decoded.at, id: INCLUDE_BOUNDARY_ROWS }),
        inbound: cursor,
      };
    }
  } catch {
    // Let the repositories surface the canonical invalid_cursor error.
  }
  return { outbound: cursor, inbound: cursor };
}

type MessagePosition = { at: string; id: string };

/** Conversation order, newest first. Negative = `left` comes first. */
function newestFirst(left: MessagePosition, right: MessagePosition): number {
  return right.at.localeCompare(left.at) || right.id.localeCompare(left.id);
}

export async function GET(request: Request, context: Context) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = getQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid conversation query" }, { status: 400 });
  const { contactId } = await context.params;
  const repository = getRepository();
  const contact = await repository.getContactById(session.workspaceId, contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  try {
    const pageSize = parsed.data.limit + 1;
    const scoped = parsed.data.cursor ? scopedMessageCursors(parsed.data.cursor) : undefined;
    const [deliveries, events] = await Promise.all([
      repository.listOutboundDeliveriesForRecipientPage(session.workspaceId, contact.instagramAccountId, contact.igScopedUserId, { limit: pageSize, ...(scoped ? { cursor: scoped.outbound } : {}) }),
      repository.listInboundEventsForRecipient(session.workspaceId, contact.instagramAccountId, contact.igScopedUserId, { limit: pageSize, ...(scoped ? { cursor: scoped.inbound } : {}) }),
    ]);
    const newest = buildConversation(contact, deliveries.records, events.records).sort(newestFirst);
    // A source that still has more rows is only fully known down to its last
    // fetched row. Anything older could be missing that source's rows, so it
    // waits for the next page - otherwise rows dropped by buildConversation
    // (no text, other identity) could let the page reach past that boundary
    // and skip messages. The newest such boundary is where knowledge ends.
    const lastDelivery = deliveries.nextCursor ? deliveries.records.at(-1) : undefined;
    const lastEvent = events.nextCursor ? events.records.at(-1) : undefined;
    const boundary = [
      ...(lastDelivery ? [{ at: lastDelivery.createdAt, id: lastDelivery.id }] : []),
      ...(lastEvent ? [{ at: lastEvent.receivedAt, id: lastEvent.id }] : []),
    ].sort(newestFirst)[0];
    const known = boundary ? newest.filter((message) => newestFirst(message, boundary) <= 0) : newest;
    const visibleNewest = known.slice(0, parsed.data.limit);
    // Resume after the last shown message when the page filled up; otherwise
    // after the boundary, so a page whose rows were all dropped still hands
    // back a cursor instead of ending the conversation early.
    const resumeAt = known.length > parsed.data.limit ? visibleNewest.at(-1) : boundary;
    return NextResponse.json({ data: {
      messages: visibleNewest.reverse(),
      ...(resumeAt ? { nextCursor: encodeInboxCursor({ kind: "messages", at: resumeAt.at, id: resumeAt.id }) } : {}),
    } });
  } catch (error) {
    const invalidCursor = error instanceof Error && error.message === "invalid_cursor";
    return NextResponse.json({ error: invalidCursor ? "Invalid cursor" : "Could not load conversation" }, { status: invalidCursor ? 400 : 500 });
  }
}

export async function PATCH(request: Request, context: Context) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid inbox operation" }, { status: 400 });
  const { contactId } = await context.params;
  const repository = getRepository();
  if (!await repository.getContactById(session.workspaceId, contactId)) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (parsed.data.action === "set_assignment" && parsed.data.assigneeUserId) {
    const assigneeUserId = parsed.data.assigneeUserId;
    const members = await repository.listMembers(session.workspaceId);
    if (!members.some((member) => member.userId === assigneeUserId)) return NextResponse.json({ error: "Assignee is not a workspace member" }, { status: 400 });
  }
  if (parsed.data.action === "set_reminder" && parsed.data.reminderAt
    && Date.parse(parsed.data.reminderAt) > Date.now() + 365 * 24 * 60 * 60 * 1_000) {
    return NextResponse.json({ error: "Reminder must be within one year" }, { status: 400 });
  }
  const patch = parsed.data.action === "mark_read" ? { action: "mark_read" as const, readAt: new Date().toISOString() } : parsed.data;
  const updated = await repository.updateInboxState(session.workspaceId, contactId, patch);
  return updated ? NextResponse.json({ data: { contact: updated } }) : NextResponse.json({ error: "Contact not found" }, { status: 404 });
}

export async function POST(request: Request, context: Context) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { contactId } = await context.params;
  const body = await request.json().catch(() => null);
  const text = typeof (body as { text?: unknown } | null)?.text === "string" ? (body as { text: string }).text.trim() : "";
  if (!text) return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  if (text.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }, { status: 400 });

  const env = getServerEnv();
  if (!env.metaTokenEncryptionKey) return NextResponse.json({ error: "Instagram messaging is not configured" }, { status: 503 });
  const repository = getRepository();
  // The contact lookup and the connection list are independent; the window
  // check needs the contact's ids. Running the reads side by side keeps the
  // pre-send validation to two round trips instead of four.
  const [contact, connections] = await Promise.all([
    repository.getContactById(session.workspaceId, contactId),
    repository.listConnections(session.workspaceId),
  ]);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (contact.suppressedAt) return NextResponse.json({ error: "This contact has opted out" }, { status: 409 });
  const inbound = await repository.listInboundEventsForRecipient(session.workspaceId, contact.instagramAccountId, contact.igScopedUserId, { limit: 1 });
  if (!isWithinMessagingWindow(inbound.records[0]?.receivedAt)) return NextResponse.json({ error: "The 24-hour Instagram reply window has closed" }, { status: 409 });

  const connection = connections.find((candidate) => candidate.igUserId === contact.instagramAccountId && candidate.status === "CONNECTED");
  if (!connection) return NextResponse.json({ error: "The Instagram account is not connected" }, { status: 409 });

  const rawIdempotencyKey = request.headers.get("idempotency-key")?.trim();
  const idempotencyKey = rawIdempotencyKey && /^[a-zA-Z0-9_-]{1,100}$/.test(rawIdempotencyKey) ? rawIdempotencyKey : createId("reply");
  const payload = { type: "text" as const, text };
  const deliveryKey = `manual-inbox:${session.workspaceId}:${contact.id}:${idempotencyKey}`;
  const client = new MetaClient({ apiVersion: env.metaApiVersion });
  const result = await executeOutboundDelivery({
    deliveryKey, workspaceId: session.workspaceId, kind: "MANUAL_INBOX", recipientId: contact.igScopedUserId,
    instagramAccountId: contact.instagramAccountId, payload, claimLeaseMs: 30_000, repository,
  }, async (message) => client.sendDirectMessage({
    igUserId: connection.igUserId,
    accessToken: unsealSecret(connection.accessTokenEncrypted, env.metaTokenEncryptionKey!),
  }, contact.igScopedUserId, message as MetaMessage));

  if (result.status === "BUSY") return NextResponse.json({ error: "This message is already sending" }, { status: 409 });
  if (result.status === "FAILED" && result.reason === "QUOTA_REJECTED") {
    return entitlementErrorResponse(new EntitlementError("limit_reached", "deliveries"))!;
  }
  if (result.status === "FAILED" || result.status === "UNKNOWN") {
    // Provider text can be localized, carry ids, or describe our token setup;
    // keep it in the logs (and the delivery ledger) and give people a sentence.
    logger.warn("Manual inbox reply was not delivered", {
      workspaceId: session.workspaceId,
      contactId: contact.id,
      status: result.status,
      error: result.error,
    });
    return NextResponse.json({
      error: result.status === "UNKNOWN"
        ? "Instagram did not confirm this message. Check the conversation before sending it again."
        : "Instagram did not accept this message. Try again in a moment.",
    }, { status: 502 });
  }
  const sentAt = new Date().toISOString();
  // A teammate is talking to this person now; keep automations out of the
  // conversation until the pause ends or someone resumes them.
  const automationsPausedUntil = new Date(Date.parse(sentAt) + MANUAL_REPLY_PAUSE_MS).toISOString();
  await Promise.all([
    repository.pauseContactAutomations(
      session.workspaceId, contact.instagramAccountId, contact.igScopedUserId, automationsPausedUntil, MANUAL_REPLY_REASON,
    ).catch(() => false),
    // Replying re-opens a closed conversation, server-side, so every
    // teammate's inbox agrees on its status.
    contact.inboxStatus === "OPEN"
      ? Promise.resolve(null)
      : repository.updateInboxState(session.workspaceId, contact.id, { action: "set_status", status: "OPEN" }).catch(() => null),
  ]);
  // The id must be the OutboundDelivery id: that is what GET returns for this
  // message, so the optimistic bubble and the refetched one dedupe.
  return NextResponse.json({ data: {
    message: { id: result.deliveryId ?? deliveryKey, direction: "outbound", text, at: sentAt, status: "sent" },
    automationsPausedUntil,
    inboxStatus: "OPEN",
  } }, { status: 201 });
}
