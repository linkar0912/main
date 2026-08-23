import { createHash } from "node:crypto";
import type { NormalizedEvent } from "../automation/types";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function payloadValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = record(value);
  if (object) {
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function messagingEventId(accountId: string, timestamp: number, item: JsonRecord): string {
  return createHash("sha256")
    .update(`${accountId}\0${timestamp}\0${stableJson(item)}`)
    .digest("base64url");
}

function interactionEventId(
  accountId: string,
  kind: "optin" | "referral",
  recipientId: string,
  timestamp: number,
  interactionPayload: string | undefined,
): string {
  return createHash("sha256")
    .update(`${accountId}\0${kind}\0${recipientId}\0${timestamp}\0${interactionPayload ?? ""}`)
    .digest("base64url");
}

/**
 * Story mentions arrive inside the regular `messages` webhook as a message attachment
 * of type `story_mention` (payload.story carries the story media id/URL). Returns the
 * attachment record when the message is a story mention.
 */
function storyMentionAttachment(message: JsonRecord): JsonRecord | null {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  for (const attachmentValue of attachments) {
    const attachment = record(attachmentValue);
    if (attachment && stringValue(attachment.type) === "story_mention") return attachment;
  }
  return null;
}

export function normalizeWebhook(payload: unknown): NormalizedEvent[] {
  const root = record(payload);
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const events: NormalizedEvent[] = [];

  for (const entryValue of entries) {
    const entry = record(entryValue);
    if (!entry) continue;
    const accountId = stringValue(entry.id);
    if (!accountId) continue;
    const entryTime = numberValue(entry.time, Date.now());

    const changes = [
      ...(Array.isArray(entry.changes) ? entry.changes : []),
      ...(entry.field === "comments" || entry.field === "live_comments"
        ? [{ field: entry.field, value: entry.value }]
        : []),
    ];
    for (const changeValue of changes) {
      const change = record(changeValue);
      if (!change || (change.field !== "comments" && change.field !== "live_comments")) continue;
      const value = record(change.value);
      if (!value) continue;
      const commentId = stringValue(value.id);
      if (!commentId) continue;
      const media = record(value.media);
      const from = record(value.from);
      // Skip comments authored by the connected business account itself. v2 posts a
      // *public* comment reply (unlike v1's private-only reply), so if Meta ever
      // delivers a webhook for the business's own reply and its text happens to match
      // a campaign keyword, treating it as inbound would create a self-triggering loop
      // of public replies. Mirrors the sender/recipient echo-skip used for messaging below.
      if (stringValue(from?.id) === accountId) continue;
      events.push({
        id: commentId,
        accountId,
        type: "comment.created",
        text: stringValue(value.text) ?? "",
        commentId,
        mediaId: stringValue(media?.id) ?? stringValue(value.media_id),
        recipientId: stringValue(from?.id),
        timestamp: numberValue(value.created_time, entryTime),
      });
    }

    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const messagingValue of messaging) {
      const item = record(messagingValue);
      if (!item) continue;
      const sender = record(item.sender);
      const recipient = record(item.recipient);
      const message = record(item.message);
      const postback = record(item.postback);
      const optin = record(item.optin);
      const referral = record(item.referral);
      const timestamp = numberValue(item.timestamp, entryTime);
      const recipientId = stringValue(sender?.id);
      const professionalAccountIsRecipient = stringValue(recipient?.id) === accountId;
      const senderIsExternal = recipientId !== accountId;
      const inbound = recipientId && professionalAccountIsRecipient && senderIsExternal;

      if (
        message &&
        inbound &&
        message.is_echo !== true &&
        message.is_self !== true &&
        message.is_deleted !== true
      ) {
        const messageId = stringValue(message.mid) ?? messagingEventId(accountId, timestamp, item);
        const storyAttachment = storyMentionAttachment(message);
        if (storyAttachment) {
          // A story mention is its own trigger type — emit it instead of a plain
          // message so story-mention flows own the reply and default responders
          // do not double-fire on the same notification.
          const payload = record(storyAttachment.payload);
          const story = record(payload?.story);
          events.push({
            id: messageId,
            accountId,
            type: "story_mention.received",
            text: stringValue(message.text) ?? "",
            ...(story?.id ? { mediaId: stringValue(story.id) } : {}),
            recipientId,
            timestamp,
          });
          continue;
        }
        const quickReply = record(message.quick_reply);
        const interactionPayload = payloadValue(quickReply?.payload);
        events.push({
          id: messageId,
          accountId,
          type: interactionPayload !== undefined ? "quick_reply.received" : "message.received",
          text: stringValue(message.text) ?? "",
          ...(interactionPayload !== undefined ? { interactionPayload } : {}),
          recipientId,
          timestamp,
        });
      } else if (postback && inbound) {
        const interactionPayload = payloadValue(postback.payload);
        events.push({
          id: stringValue(postback.mid) ?? messagingEventId(accountId, timestamp, item),
          accountId,
          type: "postback.received",
          text: stringValue(postback.payload) ?? stringValue(postback.title) ?? "",
          ...(interactionPayload !== undefined ? { interactionPayload } : {}),
          recipientId,
          timestamp,
        });
      } else if (optin && inbound) {
        const interactionPayload = payloadValue(optin.ref);
        events.push({
          id: interactionEventId(accountId, "optin", recipientId, timestamp, interactionPayload),
          accountId,
          type: "optin.received",
          text: interactionPayload ?? "",
          ...(interactionPayload !== undefined ? { interactionPayload } : {}),
          recipientId,
          timestamp,
        });
      } else if (referral && inbound) {
        const interactionPayload = payloadValue(referral.ref);
        events.push({
          id: interactionEventId(accountId, "referral", recipientId, timestamp, interactionPayload),
          accountId,
          type: "referral.received",
          text: interactionPayload ?? "",
          ...(interactionPayload !== undefined ? { interactionPayload } : {}),
          recipientId,
          timestamp,
        });
      }
    }
  }

  return events;
}
