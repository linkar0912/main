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
 * given key. Never throws — alerting must not break event processing.
 */
export async function notifyWorkspaceManagers(
  workspaceId: string,
  dedupeKey: string,
  subject: string,
  body: string,
  now = Date.now(),
): Promise<boolean> {
  if (notificationRecentlySent(dedupeKey, now)) return false;

  if (recentKeys.size >= MAX_DEDUPE_KEYS) {
    for (const [candidate, expiresAt] of recentKeys) {
      if (expiresAt <= now) recentKeys.delete(candidate);
    }
    if (recentKeys.size >= MAX_DEDUPE_KEYS) {
      const oldest = [...recentKeys.entries()].sort((a, b) => a[1] - b[1])[0][0];
      recentKeys.delete(oldest);
    }
  }
  recentKeys.set(dedupeKey, now + DEDUPE_TTL_MS);

  try {
    const members = await getRepository().listMembers(workspaceId);
    const recipients = members
      .filter((member: MemberRecord) => member.role === "OWNER" || member.role === "ADMIN")
      .map((member: MemberRecord) => member.email);
    if (recipients.length === 0) return false;

    await Promise.all(recipients.map((to: string) => sendEmail({ to, subject, body }).catch(() => undefined)));
    logger.info("workspace manager notification sent", { workspaceId, subject, recipients: recipients.length });
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
