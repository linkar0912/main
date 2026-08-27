import { logger } from "./logger";
import { sendEmail } from "./mailer";
import { getRepository } from "./repository-provider";
import type { MemberRecord } from "./repository";

// Owner/admin alerts are deduped in-process so a burst of blocked participants
// produces one email per key per window instead of one email per event. The
// worker process owns delivery, so this map lives where the sends happen.
const DEDUPE_TTL_MS = 20 * 60 * 60 * 1_000;
const MAX_DEDUPE_KEYS = 500;
const recentKeys = new Map<string, number>();

function pruneExpiredKeys(now: number): void {
  // Snapshot keys first; deleting the current entry during a for-of iteration
  // is well-defined per spec but skipping further entries is not, so collect
  // and then delete.
  const toDelete: string[] = [];
  for (const [candidate, expiresAt] of recentKeys) {
    if (expiresAt <= now) toDelete.push(candidate);
  }
  for (const key of toDelete) recentKeys.delete(key);
}

export function notificationRecentlySent(key: string, now = Date.now()): boolean {
  const expiresAt = recentKeys.get(key);
  if (expiresAt === undefined) return false;
  if (expiresAt > now) return true;
  recentKeys.delete(key);
  return false;
}

export function resetNotificationDedupeForTests(): void {
  recentKeys.clear();
}

/**
 * Emails every OWNER/ADMIN in the workspace once per dedupe window for the
 * given key. Never throws - alerting must not break event processing.
 */
export async function notifyWorkspaceManagers(
  workspaceId: string,
  dedupeKey: string,
  subject: string,
  body: string,
  now = Date.now(),
): Promise<boolean> {
  if (notificationRecentlySent(dedupeKey, now)) {
    // Caller asked to suppress; log at debug so operators can confirm the
    // dedupe window is doing its job without flooding the log.
    logger.debug("workspace manager notification suppressed", { workspaceId, dedupeKey, subject });
    return false;
  }

  // Prune any expired entries before we touch the limit so a quiet period
  // does not force needless eviction.
  if (recentKeys.size >= MAX_DEDUPE_KEYS) {
    pruneExpiredKeys(now);
  }
  // Only run the cap check (and possibly the eviction) when we are actually
  // over the limit. A previous sweep may have left us exactly at it.
  if (recentKeys.size >= MAX_DEDUPE_KEYS) {
    // Insertion order is the original key arrival, so the first key is the
    // oldest - no need to sort. Drop just one entry; subsequent calls will
    // repeat the cap if the workspace keeps producing distinct dedupe keys.
    const oldest = recentKeys.keys().next().value;
    if (oldest !== undefined) recentKeys.delete(oldest);
  }
  recentKeys.set(dedupeKey, now + DEDUPE_TTL_MS);

  try {
    const members = await getRepository().listMembers(workspaceId);
    const recipients = members
      .filter((member: MemberRecord) => member.role === "OWNER" || member.role === "ADMIN")
      .map((member: MemberRecord) => member.email);
    if (recipients.length === 0) return false;

    // Send in parallel but log per-recipient failures so a misconfigured
    // email address (or a single transient SMTP error) does not silently
    // mask itself in the success path.
    const results = await Promise.allSettled(recipients.map((to) => sendEmail({ to, subject, body })));
    let failed = 0;
    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") continue;
      failed += 1;
      logger.warn("workspace manager notification send failed", {
        workspaceId,
        to: recipients[index],
        subject,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
    logger.info("workspace manager notification sent", {
      workspaceId,
      subject,
      recipients: recipients.length,
      failed,
    });
    return true;
  } catch (error) {
    logger.error("workspace manager notification failed", {
      workspaceId,
      subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
