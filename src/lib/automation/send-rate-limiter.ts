import { createHash } from "node:crypto";
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
 * Share of the normal hourly budget one process may use when Redis is down or
 * not configured. Every web and worker process keeps its own count, so the
 * whole deployment stays well under the real ceiling even with a few
 * processes running.
 */
export const FALLBACK_BUDGET_SHARE = 0.25;

/**
 * Sends nobody is waiting for (broadcast fan-out) and public comment replies
 * are the volume that gets accounts restricted, so they never fail open. A
 * DM or private reply that answers someone who just wrote keeps working.
 */
function usesFallbackBudget(bucket: SendRateLimitBucket, priority: SendRateLimitPriority): boolean {
  return bucket === "comment_reply" || priority === "bulk";
}

function fallbackCeiling(ceiling: number): number {
  return Math.max(1, Math.floor(ceiling * FALLBACK_BUDGET_SHARE));
}

type FallbackReason = "redis_not_configured" | "redis_unavailable";

type FallbackState = {
  windowIndex: number;
  counts: Map<string, number>;
  logged: Set<string>;
};

const fallbackState: FallbackState = { windowIndex: -1, counts: new Map(), logged: new Set() };

function fallbackWindow(windowIndex: number): FallbackState {
  if (fallbackState.windowIndex !== windowIndex) {
    // A new window starts every count at zero and drops the old keys.
    fallbackState.windowIndex = windowIndex;
    fallbackState.counts = new Map();
    fallbackState.logged = new Set();
  }
  return fallbackState;
}

/** Clears the in-process fallback counters. For tests. */
export function resetSendRateLimitFallback(): void {
  fallbackState.windowIndex = -1;
  fallbackState.counts = new Map();
  fallbackState.logged = new Set();
}

/** Logs once per account, bucket, window and event so a backlog cannot flood the logs. */
function logFallbackOnce(
  state: FallbackState,
  event: "active" | "exhausted",
  key: string,
  context: Record<string, unknown>,
): void {
  const logKey = `${event}:${key}`;
  if (state.logged.has(logKey)) return;
  state.logged.add(logKey);
  logger.warn(
    event === "active"
      ? "Send rate limiter is using its in-process fallback budget"
      : "Send rate limiter fallback budget is used up for this window",
    context,
  );
}

function fallbackKey(bucket: SendRateLimitBucket, priority: SendRateLimitPriority, accountId: string): string {
  return `${bucket}:${priority}:${accountId}`;
}

function fallbackCheck(
  accountId: string,
  bucket: SendRateLimitBucket,
  priority: SendRateLimitPriority,
  limit: { max: number; windowMs: number },
  reason: FallbackReason,
  error?: string,
): SendRateLimitCheck {
  const windowIndex = Math.floor(Date.now() / limit.windowMs);
  const state = fallbackWindow(windowIndex);
  const key = fallbackKey(bucket, priority, accountId);
  const ceiling = fallbackCeiling(priority === "bulk" ? bulkCeiling(limit.max) : limit.max);
  const used = state.counts.get(key) ?? 0;
  const context = { accountId, bucket, priority, reason, ceiling, ...(error ? { error } : {}) };
  logFallbackOnce(state, "active", key, context);
  if (used >= ceiling) {
    logFallbackOnce(state, "exhausted", key, context);
    const windowEndsAt = (windowIndex + 1) * limit.windowMs;
    return { allowed: false, retryAfterMs: Math.max(0, windowEndsAt - Date.now()) };
  }
  state.counts.set(key, used + 1);
  return { allowed: true };
}

/**
 * Fixed-window counter. The key embeds the window index, so each window gets
 * its own counter and the TTL only serves as garbage collection for abandoned
 * windows. Staying a little under Meta's real ceiling is the goal, not
 * hitting it exactly - Meta doesn't publish its algorithm precisely enough to
 * justify matching it.
 *
 * Never waits: a full budget comes back as `allowed: false` with the time
 * until the window resets, and the caller decides whether to defer or skip.
 *
 * When Redis is down or not configured, realtime DMs and private replies are
 * still allowed (Meta's own throttling responses are retried through the
 * ledger), but public comment replies and bulk sends fall back to a small
 * in-process budget instead of being let through unmetered.
 */
export async function checkSendRateLimit(
  igAccountId: string,
  bucket: SendRateLimitBucket,
  priority: SendRateLimitPriority = "realtime",
): Promise<SendRateLimitCheck> {
  const limit = bucketLimit(bucket);
  if (!limit) return { allowed: true };
  const redis = getRateLimiterRedis();
  if (!redis) {
    return usesFallbackBudget(bucket, priority)
      ? fallbackCheck(igAccountId, bucket, priority, limit, "redis_not_configured")
      : { allowed: true };
  }

  const ceiling = priority === "bulk" ? bulkCeiling(limit.max) : limit.max;
  const windowIndex = Math.floor(Date.now() / limit.windowMs);
  const key = `send-rate:${bucket}:${igAccountId}:${windowIndex}`;
  let admitted: boolean;
  try {
    admitted = Number(await redis.eval(ADMIT_SCRIPT, 1, key, ceiling, limit.windowMs)) === 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A fallback send logs once per account, bucket and window (with the
    // error), so a viral post cannot turn a Redis outage into a log flood.
    if (usesFallbackBudget(bucket, priority)) {
      return fallbackCheck(igAccountId, bucket, priority, limit, "redis_unavailable", message);
    }
    logger.warn("Send rate limiter unavailable; allowing the send", { bucket, priority, error: message });
    return { allowed: true };
  }
  if (!admitted) {
    const windowEndsAt = (windowIndex + 1) * limit.windowMs;
    return { allowed: false, retryAfterMs: Math.max(0, windowEndsAt - Date.now()) };
  }
  return { allowed: true };
}

/**
 * Non-blocking try-consume: takes one unit of the budget when there is room
 * and reports `allowed: false` straight away when there is not. Same
 * semantics as checkSendRateLimit, named for callers that skip instead of
 * deferring.
 */
export const tryConsumeSendRateLimit = checkSendRateLimit;

export type SendRateLimitUsage =
  | { limited: false }
  | {
    limited: true;
    /** Sends already counted in the current window. */
    used: number;
    /** Ceiling that applies right now (the fallback ceiling when Redis is down). */
    max: number;
    retryAfterMs: number;
    /** True when the count comes from the in-process fallback. */
    fallback: boolean;
  };

/**
 * Reads how much of an account's budget the current window has used, without
 * consuming any of it. `limited: false` means nothing caps this send right
 * now: the bucket is disabled, or Redis is unavailable for a send that fails
 * open.
 */
export async function peekSendRateLimit(
  igAccountId: string,
  bucket: SendRateLimitBucket,
  priority: SendRateLimitPriority = "realtime",
): Promise<SendRateLimitUsage> {
  const limit = bucketLimit(bucket);
  if (!limit) return { limited: false };
  const windowIndex = Math.floor(Date.now() / limit.windowMs);
  const retryAfterMs = Math.max(0, (windowIndex + 1) * limit.windowMs - Date.now());
  const fallbackUsage = (reason: FallbackReason, error?: string): SendRateLimitUsage => {
    if (!usesFallbackBudget(bucket, priority)) return { limited: false };
    const state = fallbackWindow(windowIndex);
    const key = fallbackKey(bucket, priority, igAccountId);
    const max = fallbackCeiling(priority === "bulk" ? bulkCeiling(limit.max) : limit.max);
    const used = state.counts.get(key) ?? 0;
    // Shares the once-per-window logs with checkSendRateLimit, so a peek and
    // the consume that follows it never log the same outage twice.
    const context = { accountId: igAccountId, bucket, priority, reason, ceiling: max, ...(error ? { error } : {}) };
    logFallbackOnce(state, "active", key, context);
    if (used >= max) logFallbackOnce(state, "exhausted", key, context);
    return { limited: true, used, max, retryAfterMs, fallback: true };
  };

  const redis = getRateLimiterRedis();
  if (!redis) return fallbackUsage("redis_not_configured");
  try {
    const raw = await redis.get(`send-rate:${bucket}:${igAccountId}:${windowIndex}`);
    const used = Number(raw ?? 0);
    return {
      limited: true,
      used: Number.isFinite(used) && used > 0 ? used : 0,
      max: priority === "bulk" ? bulkCeiling(limit.max) : limit.max,
      retryAfterMs,
      fallback: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!usesFallbackBudget(bucket, priority)) {
      logger.warn("Send rate limiter unavailable; nothing caps this send", { bucket, priority, error: message });
    }
    return fallbackUsage("redis_unavailable", message);
  }
}

// ---------------------------------------------------------------------------
// Public comment replies on busy posts
//
// Meta's spam rules target high-frequency and repetitive public activity, and
// a viral post can bring thousands of matching comments in an hour. Public
// replies are therefore tapered and then skipped, never queued for later:
// below half the hourly budget every comment gets one; past that a shrinking
// share does; once the budget is used up none do until the window resets.
// Private replies and DMs are not affected.
// ---------------------------------------------------------------------------

/** Share of the hourly public-reply budget used before tapering begins. */
export const PUBLIC_REPLY_TAPER_START_SHARE = 0.5;

export type PublicReplySkipReason = "public_reply_hourly_limit" | "public_reply_tapered";

export type PublicReplyAdmission =
  | { allowed: true }
  | { allowed: false; reason: PublicReplySkipReason };

/**
 * The share of comments that should still get a public reply at a given
 * hourly count: 1 below the taper start, falling linearly to 0 at the budget.
 */
export function publicReplyShare(used: number, max: number): number {
  if (max <= 0) return 1;
  if (used >= max) return 0;
  const taperStart = Math.floor(max * PUBLIC_REPLY_TAPER_START_SHARE);
  if (used < taperStart) return 1;
  return (max - used) / (max - taperStart);
}

/**
 * Stable position of a comment in [0, 1). The same comment always lands in
 * the same place, so a retried job makes the same choice and tests can
 * predict which comments are kept.
 */
export function publicReplyCommentPosition(commentId: string): number {
  const digest = createHash("sha256").update(`public-reply-taper:${commentId}`).digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}

/**
 * Decides whether this comment gets a public reply, and counts it when it
 * does. Never waits: a skipped reply should be recorded as skipped, not
 * deferred, because posting it later would still add to the same burst.
 */
export async function admitPublicReply(accountId: string, commentId: string): Promise<PublicReplyAdmission> {
  const usage = await peekSendRateLimit(accountId, "comment_reply");
  if (usage.limited) {
    if (usage.used >= usage.max) return { allowed: false, reason: "public_reply_hourly_limit" };
    if (publicReplyCommentPosition(commentId) >= publicReplyShare(usage.used, usage.max)) {
      return { allowed: false, reason: "public_reply_tapered" };
    }
  }
  const consumed = await tryConsumeSendRateLimit(accountId, "comment_reply");
  return consumed.allowed ? { allowed: true } : { allowed: false, reason: "public_reply_hourly_limit" };
}

/**
 * Plain-English reason for a skipped public reply, as owners read it in
 * Activity (shown after the "Skipped" status, so it does not repeat it).
 */
export function publicReplySkipMessage(reason: PublicReplySkipReason): string {
  return reason === "public_reply_hourly_limit"
    ? "Hourly limit for public replies reached. No more are posted this hour, to keep the account safe."
    : "Busy hour. Fewer comments get a public reply as volume rises, to keep the account safe.";
}
