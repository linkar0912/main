import Redis from "ioredis";
import { getServerEnv } from "../env";

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

const globalForRateLimiter = globalThis as unknown as {
  linkarSendRateLimitRedis?: Redis;
};

function getRateLimiterRedis(): Redis | undefined {
  const redisUrl = getServerEnv().redisUrl;
  if (!redisUrl) return undefined;
  if (!globalForRateLimiter.linkarSendRateLimitRedis) {
    globalForRateLimiter.linkarSendRateLimitRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
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

/**
 * Fixed-window counter (INCR + PEXPIRE on first hit) rather than a sliding
 * window: one Redis round trip per call, no Lua script. This can admit
 * slightly more than `max` right at a window boundary, which is an accepted
 * tradeoff for simplicity here - Meta doesn't publish its own algorithm
 * precisely enough to justify matching it exactly, and staying a little
 * under Meta's real ceiling is the goal, not hitting it exactly.
 */
export async function checkSendRateLimit(
  igAccountId: string,
  bucket: SendRateLimitBucket,
): Promise<SendRateLimitCheck> {
  const limit = bucketLimit(bucket);
  const redis = getRateLimiterRedis();
  if (!limit || !redis) return { allowed: true };

  const windowIndex = Math.floor(Date.now() / limit.windowMs);
  const key = `send-rate:${bucket}:${igAccountId}:${windowIndex}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, limit.windowMs);
  }
  if (count > limit.max) {
    const windowEndsAt = (windowIndex + 1) * limit.windowMs;
    return { allowed: false, retryAfterMs: Math.max(0, windowEndsAt - Date.now()) };
  }
  return { allowed: true };
}
