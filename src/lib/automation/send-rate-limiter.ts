import Redis from "ioredis";
import { getServerEnv } from "../env";
import { logger } from "../logger";

/**
 * Meta enforces send-side limits per Instagram professional account or Page,
 * not per app - e.g. 750 private replies/hour to post/Reel comments, confirmed
 * against Meta's own Business Messaging docs. A single global counter would
 * either throttle every customer to the busiest one's ceiling, or let one
 * account's burst blow past its real per-account budget. Every bucket here
 * must therefore be keyed by the account (igAccountId, or pageId for the
 * Facebook comment-reply bucket).
 */
export type SendRateLimitBucket = "private_reply" | "direct_message" | "comment_reply";

export type SendRateLimitCheck =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

/**
 * Realtime sends (comment replies, keyword DMs, capture prompts) answer a
 * person who is waiting; bulk sends (broadcast fan-out) do not. Both draw on
 * the same per-account bucket, but bulk may only fill this share of it, so a
 * broadcast can never starve the account's live conversations.
 */
export type SendRateLimitPriority = "realtime" | "bulk";
export const BULK_SEND_BUDGET_SHARE = 0.7;

const globalForRateLimiter = globalThis as unknown as {
  linkarSendRateLimitRedis?: Redis;
};

function getRateLimiterRedis(): Redis | undefined {
  const redisUrl = getServerEnv().redisUrl;
  if (!redisUrl) return undefined;
  if (!globalForRateLimiter.linkarSendRateLimitRedis) {
    // Not a BullMQ worker connection: fail a command after one reconnect
    // attempt instead of queueing it forever while Redis is unreachable.
    globalForRateLimiter.linkarSendRateLimitRedis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  }
  return globalForRateLimiter.linkarSendRateLimitRedis;
}

/**
 * Only the `private_reply` ceiling (750/hour per Instagram account) comes from
 * Meta's own Business Messaging docs. The other two are deliberately
 * conservative self-imposed guards, not documented Meta numbers: Meta rate
 * limits Pages and Instagram messaging dynamically off account engagement and
 * does not publish a per-account hourly figure we could mirror. Staying well
 * under whatever the real ceiling is protects the connected account, so these
 * default low and are tunable per deployment.
 */
function bucketLimit(bucket: SendRateLimitBucket): { max: number; windowMs: number } | undefined {
  const env = getServerEnv();
  const max = bucket === "private_reply"
    ? env.privateReplyRateLimitPerHour
    : bucket === "direct_message"
      ? env.directMessageRateLimitPerHour
      : env.commentReplyRateLimitPerHour;
  return max > 0 ? { max, windowMs: 60 * 60_000 } : undefined;
}

function bulkCeiling(max: number): number {
  return Math.max(1, Math.floor(max * BULK_SEND_BUDGET_SHARE));
}

/**
 * Spacing between consecutive bulk sends for one account so a broadcast
 * fan-out stays inside its share of the direct-message bucket instead of
 * bursting into it and being deferred. Never faster than one per second.
 */
export function bulkSendIntervalMs(): number {
  const limit = bucketLimit("direct_message");
  if (!limit) return 1_000;
  return Math.max(1_000, Math.ceil(limit.windowMs / bulkCeiling(limit.max)));
}

/**
 * Admits one send only while the window's count is under the ceiling, and
 * counts it only when admitted - a rejected attempt must not consume budget,
 * or a deferred backlog retrying against a full bucket would keep the next
 * window full too. The read, increment and expiry run atomically in Redis.
 */
const ADMIT_SCRIPT = [
  "local current = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "if current >= tonumber(ARGV[1]) then return 0 end",
  "redis.call('INCR', KEYS[1])",
  "redis.call('PEXPIRE', KEYS[1], ARGV[2])",
  "return 1",
].join("\n");

/**
 * Fixed-window counter. The key embeds the window index, so each window gets
 * its own counter and the TTL only serves as garbage collection for abandoned
 * windows. Staying a little under Meta's real ceiling is the goal, not
 * hitting it exactly - Meta doesn't publish its algorithm precisely enough to
 * justify matching it. When Redis itself is unavailable the guard fails open:
 * Meta's own throttling responses are still retried through the ledger.
 */
export async function checkSendRateLimit(
  igAccountId: string,
  bucket: SendRateLimitBucket,
  priority: SendRateLimitPriority = "realtime",
): Promise<SendRateLimitCheck> {
  const limit = bucketLimit(bucket);
  const redis = getRateLimiterRedis();
  if (!limit || !redis) return { allowed: true };

  const ceiling = priority === "bulk" ? bulkCeiling(limit.max) : limit.max;
  const windowIndex = Math.floor(Date.now() / limit.windowMs);
  const key = `send-rate:${bucket}:${igAccountId}:${windowIndex}`;
  let admitted: boolean;
  try {
    admitted = Number(await redis.eval(ADMIT_SCRIPT, 1, key, ceiling, limit.windowMs)) === 1;
  } catch (error) {
    logger.warn("Send rate limiter unavailable; allowing the send", {
      bucket,
      error: error instanceof Error ? error.message : String(error),
    });
    return { allowed: true };
  }
  if (!admitted) {
    const windowEndsAt = (windowIndex + 1) * limit.windowMs;
    return { allowed: false, retryAfterMs: Math.max(0, windowEndsAt - Date.now()) };
  }
  return { allowed: true };
}
