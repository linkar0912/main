import { NextResponse } from "next/server";
import { z } from "zod";
import { executeOutboundDelivery } from "@/src/lib/automation/outbound-delivery";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { createId } from "@/src/lib/id";
import { encodeInboxCursor } from "@/src/lib/inbox-cursor";
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
    const options = { limit: pageSize, ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}) };
    const [deliveries, events] = await Promise.all([
      repository.listOutboundDeliveriesForRecipientPage(session.workspaceId, contact.instagramAccountId, contact.igScopedUserId, options),
      repository.listInboundEventsForRecipient(session.workspaceId, contact.instagramAccountId, contact.igScopedUserId, options),
    ]);
    const newest = buildConversation(contact, deliveries.records, events.records)
      .sort((left, right) => right.at.localeCompare(left.at) || right.id.localeCompare(left.id));
    const hasMore = newest.length > parsed.data.limit || Boolean(deliveries.nextCursor || events.nextCursor);
    const visibleNewest = newest.slice(0, parsed.data.limit);
    const last = visibleNewest.at(-1);
    return NextResponse.json({ data: {
      messages: visibleNewest.reverse(),
      ...(hasMore && last ? { nextCursor: encodeInboxCursor({ kind: "messages", at: last.at, id: last.id }) } : {}),
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

  const repository = getRepository();
  const contact = await repository.getContactById(session.workspaceId, contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (contact.suppressedAt) return NextResponse.json({ error: "This contact has opted out" }, { status: 409 });
  const inbound = await repository.listInboundEventsForRecipient(session.workspaceId, contact.instagramAccountId, contact.igScopedUserId, { limit: 1 });
  if (!isWithinMessagingWindow(inbound.records[0]?.receivedAt)) return NextResponse.json({ error: "The 24-hour Instagram reply window has closed" }, { status: 409 });

  const env = getServerEnv();
  if (!env.metaTokenEncryptionKey) return NextResponse.json({ error: "Instagram messaging is not configured" }, { status: 503 });
  const connections = await repository.listConnections(session.workspaceId);
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
  if (result.status === "FAILED" || result.status === "UNKNOWN") return NextResponse.json({ error: result.error }, { status: 502 });
  const sentAt = new Date().toISOString();
  return NextResponse.json({ data: { message: { id: result.providerMessageId ?? deliveryKey, direction: "outbound", text, at: sentAt, status: "sent" } } }, { status: 201 });
}
