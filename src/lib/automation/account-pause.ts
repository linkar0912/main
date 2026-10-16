import Redis from "ioredis";
import { getServerEnv } from "../env";
import { logger } from "../logger";
import {
  accountPausedReason,
  accountSendHeldReason,
  type AccountPausePlatform,
  type MetaUsage,
} from "../meta/errors";
import { notifyWorkspaceManagers } from "../notifications";
import type { AutomationRepository } from "../repository";

/**
 * Account-wide send pauses, for when Meta pushes back on a whole Instagram
 * account or Facebook Page rather than on one message:
 *
 * - Blocked (Graph error 368 or #2022): nothing is sent for the account for
 *   ACCOUNT_BLOCK_PAUSE_HOURS. New triggers stop at the gate instead of
 *   calling Meta again, and the owners are emailed once per pause.
 * - Recovering: for ACCOUNT_RECOVERY_HOURS after that pause, the account may
 *   send only ACCOUNT_RECOVERY_SEND_PERCENT of its hourly DM ceiling, shared
 *   by its automatic sends, so it comes back slowly instead of in a burst
 *   (manual inbox replies neither use nor wait for that share).
 * - Throttled: after THROTTLE_STRIKES_TO_PAUSE throttling errors inside
 *   THROTTLE_STRIKE_WINDOW_MS, the account waits THROTTLE_PAUSE_MS so its
 *   other sends stop too, not only the one Meta refused.
 *
 * State lives in Redis with a TTL, so the web container (manual inbox
 * replies) and the worker see the same pause. Every write is mirrored in
 * process memory, and a read takes the later of the two, so a Redis outage
 * still pauses the process that saw Meta's error (the worker, which makes
 * almost every send) instead of letting it keep sending.
 *
 * Every automatic send passes checkAccountSendGate first, and a block or
 * throttle Meta returns is recorded here:
 * - Instagram sends made through executeOutboundDelivery, campaign actions
 *   (the comment-to-DM flow) included. A campaign DM held by a cool-down or
 *   the recovery share gives back its dispatch claim and parks its job, so
 *   it is sent later rather than lost. A held campaign public reply is
 *   skipped instead, like one over the hourly public-reply budget: posted
 *   late it would only add to the same burst.
 * - The follow-gate "give it a few more seconds" notice (sendCooldownNotice
 *   in campaign-runner.ts), which is skipped rather than held, since it only
 *   means something at that moment.
 * - Facebook Page comment replies (facebook/runner.ts), keyed by Page id. A
 *   blocked Page skips its replies with a plain reason; a cool-down or the
 *   recovery share parks the job instead (without a queue, the event route
 *   answers retryable so Meta delivers the event again).
 *
 * The recovery budget is taken at the gate, so a send that turns out to be a
 * duplicate still uses a slot: it errs toward sending less, never more.
 */

export type SendPauseChannel = "instagram" | "facebook";
/** accountId is the Instagram account id, or the Page id for Facebook. */
export type SendPauseTarget = { channel: SendPauseChannel; accountId: string };

/**
 * How a send treats the reduced budget that follows a block pause:
 * "enforce" uses a slot and waits when none is left, "count" uses a slot but
 * never waits, and "ignore" neither uses nor waits for one.
 */
export type RecoveryBudgetMode = "enforce" | "count" | "ignore";

export type AccountSendGate =
  | { status: "open" }
  | { status: "blocked"; until: number }
  | { status: "throttled"; until: number }
  | { status: "recovering"; retryAfterMs: number };

/** Per-send wait after Meta throttles it: 1, 5, then 15 minutes (a deferral adds up to a minute of jitter). */
export const THROTTLE_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;
/** Throttles closer together than this count toward pausing the whole account. */
export const THROTTLE_STRIKE_WINDOW_MS = 5 * 60_000;
export const THROTTLE_STRIKES_TO_PAUSE = 3;
export const THROTTLE_PAUSE_MS = 15 * 60_000;
/** Meta's own "time to regain access" estimate is honoured up to this long. */
const MAX_USAGE_PAUSE_MS = 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const MAX_MEMORY_ENTRIES = 5_000;

type MemoryState = {
  blockedUntil?: number;
  throttledUntil?: number;
  recoveryStartsAt?: number;
  recoveryUntil?: number;
  strikes: number[];
  recoveryWindow?: { index: number; count: number };
};

const memory = new Map<string, MemoryState>();

const globalForAccountPause = globalThis as unknown as {
  linkarAccountPauseRedis?: Redis;
};

function getPauseRedis(): Redis | undefined {
  const redisUrl = getServerEnv().redisUrl;
  if (!redisUrl) return undefined;
  if (!globalForAccountPause.linkarAccountPauseRedis) {
    // Not a BullMQ worker connection. A command fails after one reconnect
    // attempt while Redis is unreachable, and after 1.5 s when Valkey accepts
    // the connection but never answers (a stall), so the send falls back to
    // this process's copy instead of hanging, the manual inbox reply included.
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3_000, commandTimeout: 1_500 });
    // Failures surface on each command and fall back to memory; the event is
    // handled so ioredis does not also print an unhandled-error warning.
    redis.on("error", () => undefined);
    globalForAccountPause.linkarAccountPauseRedis = redis;
  }
  return globalForAccountPause.linkarAccountPauseRedis;
}

function targetKey(target: SendPauseTarget): string {
  return `${target.channel}:${target.accountId}`;
}

function redisKey(kind: "blocked" | "throttled" | "recovery" | "strikes", target: SendPauseTarget): string {
  return `account-send:${kind}:${targetKey(target)}`;
}

function recoveryCountKey(target: SendPauseTarget, windowIndex: number): string {
  return `account-send:recovery-count:${targetKey(target)}:${windowIndex}`;
}

function toTime(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Every send checks the store, so an outage is reported once a minute, not once per send. */
const REDIS_WARNING_INTERVAL_MS = 60_000;
let lastRedisWarningAt = Number.NEGATIVE_INFINITY;

function warnRedis(action: string, error: unknown): void {
  const now = Date.now();
  if (now - lastRedisWarningAt < REDIS_WARNING_INTERVAL_MS) return;
  lastRedisWarningAt = now;
  logger.warn("Account pause store unavailable; using this process's copy", {
    action,
    error: error instanceof Error ? error.message : String(error),
  });
}

function memoryState(target: SendPauseTarget): MemoryState {
  const key = targetKey(target);
  let state = memory.get(key);
  if (!state) {
    if (memory.size >= MAX_MEMORY_ENTRIES) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) memory.delete(oldest);
    }
    state = { strikes: [] };
    memory.set(key, state);
  }
  return state;
}

type SharedState = { blockedUntil: number; throttledUntil: number; recoveryStartsAt: number };

async function readShared(redis: Redis, target: SendPauseTarget): Promise<SharedState | null> {
  try {
    const [blocked, throttled, recovery] = await redis.mget(
      redisKey("blocked", target),
      redisKey("throttled", target),
      redisKey("recovery", target),
    );
    return { blockedUntil: toTime(blocked), throttledUntil: toTime(throttled), recoveryStartsAt: toTime(recovery) };
  } catch (error) {
    warnRedis("read", error);
    return null;
  }
}

/**
 * The reduced hourly budget an account runs on while it recovers: a share of
 * its DM ceiling (the private-reply ceiling when DMs are uncapped), shared by
 * every kind of send. Null when neither ceiling is set.
 */
export function recoveryHourlyLimit(): number | null {
  const env = getServerEnv();
  const base = env.directMessageRateLimitPerHour || env.privateReplyRateLimitPerHour;
  if (base <= 0) return null;
  return Math.max(1, Math.floor((base * env.accountRecoverySendPercent) / 100));
}

async function admitRecoverySend(
  redis: Redis | undefined,
  target: SendPauseTarget,
  windowIndex: number,
  limit: number,
  mustFit: boolean,
): Promise<boolean> {
  if (redis) {
    const key = recoveryCountKey(target, windowIndex);
    try {
      const count = await redis.incr(key);
      await redis.pexpire(key, HOUR_MS);
      if (count <= limit || !mustFit) return true;
      // A refused send must not use up the budget of the sends after it.
      await redis.decr(key).catch(() => undefined);
      return false;
    } catch (error) {
      warnRedis("recovery", error);
    }
  }
  const state = memoryState(target);
  if (state.recoveryWindow?.index !== windowIndex) state.recoveryWindow = { index: windowIndex, count: 0 };
  if (mustFit && state.recoveryWindow.count >= limit) return false;
  state.recoveryWindow.count += 1;
  return true;
}

/**
 * Checked before every automatic send. Every send honours a block or a
 * throttle pause; `recovery` says how it treats the reduced budget after a
 * block (see RecoveryBudgetMode, default "enforce"). Never throws.
 */
export async function checkAccountSendGate(
  target: SendPauseTarget,
  options: { now?: number; recovery?: RecoveryBudgetMode } = {},
): Promise<AccountSendGate> {
  const now = options.now ?? Date.now();
  const redis = getPauseRedis();
  const shared = redis ? await readShared(redis, target) : null;
  const local = memory.get(targetKey(target));

  const blockedUntil = Math.max(shared?.blockedUntil ?? 0, local?.blockedUntil ?? 0);
  if (blockedUntil > now) return { status: "blocked", until: blockedUntil };
  const throttledUntil = Math.max(shared?.throttledUntil ?? 0, local?.throttledUntil ?? 0);
  if (throttledUntil > now) return { status: "throttled", until: throttledUntil };

  // The shared recovery key expires when recovery ends, so its presence is
  // the end bound; the local copy keeps both bounds.
  const sharedRecovering = Boolean(shared && shared.recoveryStartsAt > 0 && shared.recoveryStartsAt <= now);
  const localRecovering = local?.recoveryStartsAt !== undefined
    && local.recoveryStartsAt <= now
    && (local.recoveryUntil ?? 0) > now;
  const recovery = options.recovery ?? "enforce";
  if ((!sharedRecovering && !localRecovering) || recovery === "ignore") return { status: "open" };

  const limit = recoveryHourlyLimit();
  if (limit === null) return { status: "open" };
  const windowIndex = Math.floor(now / HOUR_MS);
  const mustFit = recovery === "enforce";
  if (await admitRecoverySend(shared ? redis : undefined, target, windowIndex, limit, mustFit)) return { status: "open" };
  return { status: "recovering", retryAfterMs: Math.max(1_000, (windowIndex + 1) * HOUR_MS - now) };
}

/**
 * Starts the block pause and the recovery period after it. `created` is true
 * only for the call that started this pause, so the owners hear about it once
 * however many in-flight sends Meta refuses at the same moment. A pause that
 * is already running keeps its end time. Never throws.
 */
export async function recordAccountBlock(
  target: SendPauseTarget,
  options: { now?: number } = {},
): Promise<{ until: number; created: boolean }> {
  const now = options.now ?? Date.now();
  const env = getServerEnv();
  const pauseMs = env.accountBlockPauseHours * HOUR_MS;
  const recoveryMs = env.accountRecoveryHours * HOUR_MS;
  let until = now + pauseMs;
  let created: boolean | undefined;

  const redis = getPauseRedis();
  if (redis) {
    try {
      const set = await redis.set(redisKey("blocked", target), String(until), "PX", pauseMs, "NX");
      if (set === "OK") {
        created = true;
        if (recoveryMs > 0) {
          await redis.set(redisKey("recovery", target), String(until), "PX", pauseMs + recoveryMs);
        }
      } else {
        created = false;
        const existing = toTime(await redis.get(redisKey("blocked", target)));
        if (existing > now) until = existing;
      }
    } catch (error) {
      warnRedis("block", error);
      created = undefined;
    }
  }

  const state = memoryState(target);
  const localUntil = state.blockedUntil ?? 0;
  if (created === undefined) {
    created = localUntil <= now;
    if (!created) until = localUntil;
  }
  if (until > localUntil) {
    state.blockedUntil = until;
    if (recoveryMs > 0) {
      state.recoveryStartsAt = until;
      state.recoveryUntil = until + recoveryMs;
    }
  }
  return { until, created };
}

/** The per-send wait after Meta throttled this delivery's Nth attempt. */
export function throttleBackoffMs(attempt: number): number {
  const index = Math.min(Math.max(1, Math.floor(attempt)), THROTTLE_BACKOFF_MS.length) - 1;
  return THROTTLE_BACKOFF_MS[index];
}

/**
 * Counts one throttling error for the account and pauses the whole account
 * when they repeat inside the window, or when Meta's usage headers (if the
 * caller has them) say access is already lost. Never throws.
 */
export async function recordAccountThrottle(
  target: SendPauseTarget,
  options: { now?: number; usage?: MetaUsage | null } = {},
): Promise<{ strikes: number; pausedUntil?: number }> {
  const now = options.now ?? Date.now();
  const redis = getPauseRedis();
  let strikes: number | undefined;
  if (redis) {
    try {
      strikes = await redis.incr(redisKey("strikes", target));
      // Refreshed on every strike: the count clears once throttling stops for a full window.
      await redis.pexpire(redisKey("strikes", target), THROTTLE_STRIKE_WINDOW_MS);
    } catch (error) {
      warnRedis("throttle", error);
      strikes = undefined;
    }
  }
  const state = memoryState(target);
  const lastStrike = state.strikes.at(-1);
  if (lastStrike !== undefined && now - lastStrike >= THROTTLE_STRIKE_WINDOW_MS) state.strikes = [];
  state.strikes.push(now);
  strikes ??= state.strikes.length;

  let pauseMs = strikes >= THROTTLE_STRIKES_TO_PAUSE ? THROTTLE_PAUSE_MS : 0;
  if (options.usage) {
    if (options.usage.regainAccessMs > 0) {
      pauseMs = Math.max(pauseMs, Math.min(options.usage.regainAccessMs, MAX_USAGE_PAUSE_MS));
    } else if (options.usage.highestPercent >= 100) {
      pauseMs = Math.max(pauseMs, THROTTLE_PAUSE_MS);
    }
  }
  if (pauseMs === 0) return { strikes };

  const until = now + pauseMs;
  if (redis) {
    try {
      const existing = toTime(await redis.get(redisKey("throttled", target)));
      if (existing < until) await redis.set(redisKey("throttled", target), String(until), "PX", pauseMs);
    } catch (error) {
      warnRedis("throttle-pause", error);
    }
  }
  state.throttledUntil = Math.max(state.throttledUntil ?? 0, until);
  logger.warn("Repeated Meta throttling; account sends paused briefly", {
    channel: target.channel,
    accountId: target.accountId,
    strikes,
    pauseMs,
  });
  return { strikes, pausedUntil: until };
}

function pauseEndLabel(until: number): string {
  const label = new Date(until).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${label} UTC`;
}

export function pausePlatform(target: SendPauseTarget): AccountPausePlatform {
  return target.channel === "facebook" ? "Facebook" : "Instagram";
}

/**
 * The reason stored on a send held back during a block pause, with the time
 * still left so Home can say when replies restart from any recent record.
 */
export function heldSendReason(target: SendPauseTarget, until: number, now = Date.now()): string {
  return accountSendHeldReason(until - now, pausePlatform(target));
}

/**
 * Emails the workspace's owners and admins that Meta limited the account and
 * when automatic replies restart. Uses the same mailer and dedupe as the
 * expired-connection alert. Never throws.
 */
export async function alertOwnersOfAccountPause(
  repository: AutomationRepository,
  target: SendPauseTarget,
  until: number,
): Promise<void> {
  try {
    const mapping = target.channel === "instagram"
      ? await repository.findWorkspaceByInstagramAccount(target.accountId)
        .then((found) => found && { workspaceId: found.workspaceId, name: `@${found.connection.username}` })
      : await repository.findWorkspaceByFacebookPage(target.accountId)
        .then((found) => found && { workspaceId: found.workspaceId, name: found.page.pageName });
    if (!mapping) return;
    const platform = pausePlatform(target);
    const restart = pauseEndLabel(until);
    const slowly = getServerEnv().accountRecoveryHours > 0 ? ", and after that it restarts them slowly" : "";
    await notifyWorkspaceManagers(
      mapping.workspaceId,
      `account-send-paused:${targetKey(target)}:${until}`,
      `${platform} has limited ${mapping.name}`,
      `${platform} has limited ${mapping.name} from sending messages. Linkar paused automatic replies on it until ${restart}${slowly}. You don't need to do anything in Linkar. If ${platform} shows a warning in its app, you can review or appeal it there. Linkar can't appeal for you.`,
    );
  } catch (error) {
    logger.warn("Could not alert owners about an account send pause", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Everything a send path does when Meta blocks an account: start (or join)
 * the pause, email the owners once per pause, and hand back the reason to
 * store on the refused send. The reason carries the pause length, which Home
 * reads back to say when replies restart. Never throws.
 */
export async function pauseAccountAfterBlock(
  repository: AutomationRepository,
  target: SendPauseTarget,
  options: { now?: number } = {},
): Promise<{ until: number; created: boolean; reason: string }> {
  const now = options.now ?? Date.now();
  const pause = await recordAccountBlock(target, { now });
  logger.warn("Meta blocked an account from sending; automatic sends paused", {
    channel: target.channel,
    accountId: target.accountId,
    pausedUntil: new Date(pause.until).toISOString(),
    newPause: pause.created,
  });
  if (pause.created) void alertOwnersOfAccountPause(repository, target, pause.until);
  return { ...pause, reason: accountPausedReason(pause.until - now, pausePlatform(target)) };
}

export function resetAccountPauseStateForTests(): void {
  memory.clear();
  lastRedisWarningAt = Number.NEGATIVE_INFINITY;
}
