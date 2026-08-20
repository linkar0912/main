import type { NormalizedEvent } from "../automation/types";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
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
      const timestamp = numberValue(item.timestamp, entryTime);
      const recipientId = stringValue(sender?.id);
      const professionalAccountIsRecipient = stringValue(recipient?.id) === accountId;
      const senderIsExternal = recipientId !== accountId;

      if (
        message &&
        recipientId &&
        professionalAccountIsRecipient &&
        senderIsExternal &&
        message.is_echo !== true &&
        message.is_self !== true &&
        message.is_deleted !== true
      ) {
        const messageId = stringValue(message.mid) ?? `${accountId}:${timestamp}`;
        events.push({
          id: messageId,
          accountId,
          type: "message.received",
          text: stringValue(message.text) ?? "",
          recipientId,
          timestamp,
        });
      } else if (postback && recipientId && professionalAccountIsRecipient && senderIsExternal) {
        events.push({
          id: stringValue(postback.mid) ?? `${accountId}:postback:${timestamp}`,
          accountId,
          type: "postback.received",
          text: stringValue(postback.payload) ?? stringValue(postback.title) ?? "",
          recipientId,
          timestamp,
        });
      }
    }
  }

  return events;
}
