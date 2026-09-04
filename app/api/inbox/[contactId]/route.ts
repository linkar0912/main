import { NextResponse } from "next/server";
import { executeOutboundDelivery } from "@/src/lib/automation/outbound-delivery";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { createId } from "@/src/lib/id";
import { buildConversation } from "@/src/lib/inbox";
import { isWithinMessagingWindow } from "@/src/lib/messaging-window";
import { MetaClient } from "@/src/lib/meta/client";
import type { MetaMessage } from "@/src/lib/meta/types";
import { getRepository } from "@/src/lib/repository-provider";
import { unsealSecret } from "@/src/lib/security/secrets";

export const runtime = "nodejs";

const HISTORY_LIMIT = 500;
const MAX_MESSAGE_LENGTH = 1_000;
const MESSAGE_EVENT_TYPES = new Set(["message.received", "quick_reply.received", "postback.received", "story_mention.received"]);

type Context = { params: Promise<{ contactId: string }> };

export async function GET(request: Request, context: Context) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { contactId } = await context.params;
  const repository = getRepository();
  const contact = await repository.getContactById(session.workspaceId, contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const [deliveries, events] = await Promise.all([
    repository.listOutboundDeliveriesForRecipient(
      session.workspaceId,
      contact.instagramAccountId,
      contact.igScopedUserId,
      HISTORY_LIMIT,
    ),
    repository.listRecentWebhookEvents(session.workspaceId, HISTORY_LIMIT),
  ]);
  return NextResponse.json({ data: { messages: buildConversation(contact, deliveries, events) } });
}

export async function POST(request: Request, context: Context) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { contactId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = typeof (body as { text?: unknown } | null)?.text === "string"
    ? (body as { text: string }).text.trim()
    : "";
  if (!text) return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  if (text.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }, { status: 400 });
  }

  const repository = getRepository();
  const contact = await repository.getContactById(session.workspaceId, contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (contact.suppressedAt) return NextResponse.json({ error: "This contact has opted out" }, { status: 409 });

  const events = await repository.listRecentWebhookEvents(session.workspaceId, HISTORY_LIMIT);
  const lastInboundAt = events
    .filter((event) => MESSAGE_EVENT_TYPES.has(event.eventType)
      && event.payload.accountId === contact.instagramAccountId
      && event.payload.recipientId === contact.igScopedUserId)
    .reduce<string | undefined>((latest, event) => !latest || event.receivedAt > latest ? event.receivedAt : latest, undefined);
  if (!isWithinMessagingWindow(lastInboundAt)) {
    return NextResponse.json({ error: "The 24-hour Instagram reply window has closed" }, { status: 409 });
  }

  const env = getServerEnv();
  if (!env.metaTokenEncryptionKey) {
    return NextResponse.json({ error: "Instagram messaging is not configured" }, { status: 503 });
  }
  const connections = await repository.listConnections(session.workspaceId);
  const connection = connections.find((candidate) => candidate.igUserId === contact.instagramAccountId && candidate.status === "CONNECTED");
  if (!connection) return NextResponse.json({ error: "The Instagram account is not connected" }, { status: 409 });

  const rawIdempotencyKey = request.headers.get("idempotency-key")?.trim();
  const idempotencyKey = rawIdempotencyKey && /^[a-zA-Z0-9_-]{1,100}$/.test(rawIdempotencyKey)
    ? rawIdempotencyKey
    : createId("reply");
  const payload = { type: "text" as const, text };
  const deliveryKey = `manual-inbox:${session.workspaceId}:${contact.id}:${idempotencyKey}`;
  const client = new MetaClient({ apiVersion: env.metaApiVersion });
  const result = await executeOutboundDelivery({
    deliveryKey,
    workspaceId: session.workspaceId,
    kind: "MANUAL_INBOX",
    recipientId: contact.igScopedUserId,
    instagramAccountId: contact.instagramAccountId,
    payload,
    claimLeaseMs: 30_000,
    repository,
  }, async (message) => client.sendDirectMessage({
    igUserId: connection.igUserId,
    accessToken: unsealSecret(connection.accessTokenEncrypted, env.metaTokenEncryptionKey!),
  }, contact.igScopedUserId, message as MetaMessage));

  if (result.status === "BUSY") return NextResponse.json({ error: "This message is already sending" }, { status: 409 });
  if (result.status === "FAILED" || result.status === "UNKNOWN") {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  const sentAt = new Date().toISOString();
  return NextResponse.json({
    data: {
      message: {
        id: result.providerMessageId ?? deliveryKey,
        direction: "outbound",
        text,
        at: sentAt,
        status: "sent",
      },
    },
  }, { status: 201 });
}
