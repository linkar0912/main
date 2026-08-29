import { createHash } from "node:crypto";
import type { FacebookNormalizedEvent } from "./types";

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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = record(value);
  if (object) {
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function feedChangeId(pageId: string, timestamp: number, item: JsonRecord): string {
  // Page feed changes don't ship a globally-unique id of their own; we hash
  // (pageId, timestamp, stable item) so a redelivery collapses to the same id
  // and the queue's jobId-based dedupe keeps us from replying twice.
  return createHash("sha256")
    .update(`${pageId}\0${timestamp}\0${stableJson(item)}`)
    .digest("base64url");
}

/**
 * Normalize a Facebook Page webhook payload into per-event records the runner
 * can consume. v1 only handles `feed` change comments; reactions, shares, and
 * other feed actions are ignored. The shape mirrors the Instagram normalizer
 * as much as possible so the runner can apply the same engine to either.
 */
export function normalizeFacebookWebhook(payload: unknown): FacebookNormalizedEvent[] {
  const root = record(payload);
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const events: FacebookNormalizedEvent[] = [];

  for (const entryValue of entries) {
    const entry = record(entryValue);
    if (!entry) continue;
    const pageId = stringValue(entry.id);
    if (!pageId) continue;
    const entryTime = numberValue(entry.time, Date.now());

    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const changeValue of changes) {
      const change = record(changeValue);
      if (!change || change.field !== "feed") continue;
      const value = record(change.value);
      if (!value) continue;
      // Only react to comment creations. Edits and deletes are out of scope
      // for v1 and would otherwise spam the activity inbox.
      if (value.verb !== "add") continue;
      if (value.item !== "comment") continue;

      const commentId = stringValue(value.comment_id);
      if (!commentId) continue;
      const postId = stringValue(value.post_id);
      if (!postId) continue;
      const message = stringValue(value.message) ?? "";
      const from = record(value.from);
      const senderId = stringValue(from?.id);
      const senderName = stringValue(from?.name);
      const parentId = stringValue(value.parent_id);

      events.push({
        id: feedChangeId(pageId, entryTime, change),
        pageId,
        commentId,
        postId,
        text: message,
        ...(senderId ? { senderId } : {}),
        ...(senderName ? { senderName } : {}),
        ...(parentId ? { parentId } : {}),
        timestamp: entryTime,
      });
    }
  }

  return events;
}
