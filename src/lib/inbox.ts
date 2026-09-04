import { isWithinMessagingWindow } from "./messaging-window";
import type { AutomationContactRecord, OutboundDeliveryRecord, WebhookEventRecord } from "./repository";

const MESSAGE_EVENT_TYPES = new Set([
  "message.received",
  "quick_reply.received",
  "postback.received",
  "story_mention.received",
]);

export type InboxContact = {
  id: string;
  username?: string;
  avatarUrl: string;
  preview: string;
  lastMessageAt: string;
  canMessage: boolean;
  leadStatus: AutomationContactRecord["leadStatus"];
  tags: string[];
};

export type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  at: string;
  status: "received" | "sending" | "sent" | "failed" | "unknown";
  error?: string;
};

function identityKey(accountId: string, personId: string): string {
  return `${accountId}:${personId}`;
}

function inboundIdentity(event: WebhookEventRecord): string | undefined {
  if (!MESSAGE_EVENT_TYPES.has(event.eventType)) return undefined;
  const accountId = typeof event.payload.accountId === "string" ? event.payload.accountId : undefined;
  const personId = typeof event.payload.recipientId === "string" ? event.payload.recipientId : undefined;
  return accountId && personId ? identityKey(accountId, personId) : undefined;
}

function eventText(event: WebhookEventRecord): string {
  return typeof event.payload.text === "string" && event.payload.text.trim()
    ? event.payload.text.trim()
    : event.eventType === "story_mention.received"
      ? "Mentioned you in a story"
      : "Instagram interaction";
}

function deliveryText(delivery: OutboundDeliveryRecord): string | undefined {
  const directText = delivery.payload.text;
  if (typeof directText === "string" && directText.trim()) return directText.trim();
  const message = delivery.payload.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (message && typeof message === "object") {
    const text = (message as Record<string, unknown>).text;
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  return undefined;
}

function deliveryStatus(state: OutboundDeliveryRecord["state"]): InboxMessage["status"] {
  if (state === "SENT") return "sent";
  if (state === "FAILED") return "failed";
  if (state === "UNKNOWN") return "unknown";
  return "sending";
}

export function buildInboxContacts(
  contacts: AutomationContactRecord[],
  events: WebhookEventRecord[],
  usernames: ReadonlyMap<string, string>,
  now: number = Date.now(),
): InboxContact[] {
  const latestInbound = new Map<string, WebhookEventRecord>();
  for (const event of events) {
    const key = inboundIdentity(event);
    if (!key) continue;
    const current = latestInbound.get(key);
    if (!current || current.receivedAt < event.receivedAt) latestInbound.set(key, event);
  }

  return contacts
    .map((contact) => {
      const key = identityKey(contact.instagramAccountId, contact.igScopedUserId);
      const latest = latestInbound.get(key);
      return {
        id: contact.id,
        username: usernames.get(key),
        avatarUrl: `/api/contacts/${contact.id}/avatar`,
        preview: latest ? eventText(latest) : "No messages yet",
        lastMessageAt: latest?.receivedAt ?? contact.lastSeenAt,
        canMessage: isWithinMessagingWindow(latest?.receivedAt, now),
        leadStatus: contact.leadStatus,
        tags: contact.tags,
      };
    })
    .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt) || left.id.localeCompare(right.id));
}

export function buildConversation(
  contact: AutomationContactRecord,
  deliveries: OutboundDeliveryRecord[],
  events: WebhookEventRecord[],
): InboxMessage[] {
  const key = identityKey(contact.instagramAccountId, contact.igScopedUserId);
  const inbound: InboxMessage[] = events.flatMap((event) => {
    if (inboundIdentity(event) !== key) return [];
    return [{ id: event.id, direction: "inbound", text: eventText(event), at: event.receivedAt, status: "received" }];
  });
  const outbound: InboxMessage[] = deliveries.flatMap((delivery) => {
    if (delivery.workspaceId !== contact.workspaceId
      || delivery.instagramAccountId !== contact.instagramAccountId
      || delivery.recipientId !== contact.igScopedUserId) return [];
    const text = deliveryText(delivery);
    if (!text) return [];
    return [{
      id: delivery.id,
      direction: "outbound",
      text,
      at: delivery.createdAt,
      status: deliveryStatus(delivery.state),
      ...(delivery.lastError ? { error: delivery.lastError } : {}),
    }];
  });
  return [...inbound, ...outbound].sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
}
