import { isWithinMessagingWindow } from "./messaging-window";
import { decodeInteractionPayloadShape, isCanonicalBase64Url } from "./automation/postback";
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
  /** Photo, reel, voice note... sent by the contact; `url` may expire on Meta's CDN. */
  attachment?: { type: string; label: string; url?: string };
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

export function presentInboxText(value: string): string {
  const text = value.trim();
  const parts = text.split(".");
  if (parts.length === 2 && parts[0].length < 1024 && parts[1].length === 43 && isCanonicalBase64Url(parts[1])) {
    const interaction = decodeInteractionPayloadShape(parts[0]);
    if (interaction) return interaction.action === "opt_in" ? "Tapped the opt-in button" : "Checked follow status";
  }
  return text;
}

// Mirrored by public.linkar_inbound_preview (see the inbound_attachment_labels
// migration) so the list preview and the conversation read the same.
const ATTACHMENT_LABELS: Record<string, string> = {
  image: "Sent a photo",
  video: "Sent a video",
  audio: "Sent a voice message",
  file: "Sent a file",
  share: "Shared a post",
  ig_post: "Shared a post",
  ig_reel: "Shared a reel",
  reel: "Shared a reel",
  animated_image_share: "Sent a GIF",
  sticker: "Sent a sticker",
  like_heart: "Sent a ❤️",
  unsupported: "Sent a message Instagram doesn't share with apps",
};

/** Human label for an inbound event that carries no text. */
export function describeInboundWithoutText(eventType: string, attachmentType?: unknown): string {
  if (typeof attachmentType === "string" && attachmentType) return ATTACHMENT_LABELS[attachmentType] ?? "Sent an attachment";
  if (eventType === "story_mention.received") return "Mentioned you in a story";
  if (eventType === "quick_reply.received") return "Tapped a quick reply";
  if (eventType === "postback.received") return "Tapped a button";
  // Text-less DMs recorded before attachment kinds were stored.
  return "Sent an attachment";
}

function eventText(event: WebhookEventRecord): string {
  return typeof event.payload.text === "string" && event.payload.text.trim()
    ? presentInboxText(event.payload.text)
    : describeInboundWithoutText(event.eventType, event.payload.attachmentType);
}

function eventAttachment(event: WebhookEventRecord): InboxMessage["attachment"] {
  const type = event.payload.attachmentType;
  if (typeof type !== "string" || !type) return undefined;
  const url = event.payload.attachmentUrl;
  return {
    type,
    label: describeInboundWithoutText(event.eventType, type),
    ...(typeof url === "string" && url.startsWith("https://") ? { url } : {}),
  };
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
    const attachment = eventAttachment(event);
    return [{
      id: event.id, direction: "inbound", text: eventText(event), at: event.receivedAt, status: "received",
      ...(attachment ? { attachment } : {}),
    }];
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
