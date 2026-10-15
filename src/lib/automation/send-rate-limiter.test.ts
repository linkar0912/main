import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeRedis {
  private readonly store = new Map<string, { count: number; expiresAt: number | null }>();

  async incr(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (entry && (entry.expiresAt === null || entry.expiresAt > Date.now())) {
      entry.count += 1;
      return entry.count;
    }
    this.store.set(key, { count: 1, expiresAt: null });
    return 1;
  }

  async pexpire(key: string, ms: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) entry.expiresAt = Date.now() + ms;
  }

  async get(key: string): Promise<string | null> {
    if (failNextEval.value) throw new Error("connection is closed");
    const count = this.count(key);
    return count > 0 ? String(count) : null;
  }

  count(key: string): number {
    const entry = this.store.get(key);
    return entry && (entry.expiresAt === null || entry.expiresAt > Date.now()) ? entry.count : 0;
  }

  // Emulates the limiter's admit script: count only when under the ceiling.
  async eval(_script: string, _keys: number, key: string, ceiling: number, windowMs: number): Promise<number> {
    if (failNextEval.value) throw new Error("connection is closed");
    if (this.count(key) >= Number(ceiling)) return 0;
    await this.incr(key);
    await this.pexpire(key, Number(windowMs));
    return 1;
  }
}

const failNextEval = vi.hoisted(() => ({ value: false }));
const logged = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("ioredis", () => ({ default: FakeRedis }));
vi.mock("../logger", () => ({ logger: { warn: logged.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const originalRedisUrl = process.env.REDIS_URL;
const originalLimit = process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR;
const originalDmLimit = process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR;
const originalCommentLimit = process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR;

describe("checkSendRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
    logged.warn.mockReset();
    failNextEval.value = false;
    process.env.REDIS_URL = "redis://localhost:6379";
    // The module caches its Redis connection on globalThis (survives HMR in
    // dev), which also means it survives vi.resetModules() - clear it so
    // each test gets a fresh in-memory FakeRedis store.
    delete (globalThis as { linkarSendRateLimitRedis?: unknown }).linkarSendRateLimitRedis;
  });

  afterEach(() => {
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
    if (originalLimit === undefined) delete process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR;
    else process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR = originalLimit;
    if (originalDmLimit === undefined) delete process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR;
    else process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = originalDmLimit;
    if (originalCommentLimit === undefined) delete process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR;
    else process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = originalCommentLimit;
  });

  it("allows every call when Redis is not configured", async () => {
    delete process.env.REDIS_URL;
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    for (let i = 0; i < 10; i += 1) {
      expect(await checkSendRateLimit("ig_account_1", "private_reply")).toEqual({ allowed: true });
    }
  });

  it("allows every call when the limit is disabled (0)", async () => {
    process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR = "0";
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    for (let i = 0; i < 5; i += 1) {
      expect(await checkSendRateLimit("ig_account_1", "private_reply")).toEqual({ allowed: true });
    }
  });

  it("allows calls up to the configured max, then blocks with a retryAfterMs", async () => {
    process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR = "3";
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    for (let i = 0; i < 3; i += 1) {
      expect(await checkSendRateLimit("ig_account_1", "private_reply")).toEqual({ allowed: true });
    }
    const blocked = await checkSendRateLimit("ig_account_1", "private_reply");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
      expect(blocked.retryAfterMs).toBeLessThanOrEqual(60 * 60_000);
    }
  });

  it("scopes the budget per Instagram account - one account's burst doesn't affect another's", async () => {
    process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR = "1";
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    expect(await checkSendRateLimit("ig_account_1", "private_reply")).toEqual({ allowed: true });
    expect((await checkSendRateLimit("ig_account_1", "private_reply")).allowed).toBe(false);
    expect(await checkSendRateLimit("ig_account_2", "private_reply")).toEqual({ allowed: true });
  });

  it("meters the direct_message and comment_reply buckets independently", async () => {
    process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR = "1";
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "1";
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "1";
    const { checkSendRateLimit } = await import("./send-rate-limiter");

    // Spending one bucket must not spend the others: a DM blast should never
    // eat the account's comment-reply budget or vice versa.
    expect(await checkSendRateLimit("ig_account_1", "direct_message")).toEqual({ allowed: true });
    expect((await checkSendRateLimit("ig_account_1", "direct_message")).allowed).toBe(false);
    expect(await checkSendRateLimit("ig_account_1", "comment_reply")).toEqual({ allowed: true });
    expect((await checkSendRateLimit("ig_account_1", "comment_reply")).allowed).toBe(false);
    expect(await checkSendRateLimit("ig_account_1", "private_reply")).toEqual({ allowed: true });
    expect((await checkSendRateLimit("ig_account_1", "private_reply")).allowed).toBe(false);
  });

  it("does not spend budget on rejected attempts", async () => {
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "2";
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    await checkSendRateLimit("ig_account_1", "direct_message");
    await checkSendRateLimit("ig_account_1", "direct_message");
    for (let i = 0; i < 5; i += 1) {
      expect((await checkSendRateLimit("ig_account_1", "direct_message")).allowed).toBe(false);
    }
    const redis = (globalThis as unknown as { linkarSendRateLimitRedis: FakeRedis }).linkarSendRateLimitRedis;
    const windowIndex = Math.floor(Date.now() / 3_600_000);
    expect(redis.count(`send-rate:direct_message:ig_account_1:${windowIndex}`)).toBe(2);
  });

  it("reserves part of the hourly budget for realtime sends", async () => {
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "10";
    const { checkSendRateLimit, bulkSendIntervalMs } = await import("./send-rate-limiter");
    let bulkAllowed = 0;
    for (let i = 0; i < 10; i += 1) {
      if ((await checkSendRateLimit("ig_account_1", "direct_message", "bulk")).allowed) bulkAllowed += 1;
    }
    expect(bulkAllowed).toBe(7);
    // The remaining 30% is still available to people waiting on a reply.
    for (let i = 0; i < 3; i += 1) {
      expect(await checkSendRateLimit("ig_account_1", "direct_message")).toEqual({ allowed: true });
    }
    expect((await checkSendRateLimit("ig_account_1", "direct_message")).allowed).toBe(false);
    // Broadcast fan-out is paced to the bulk share: 7 per hour.
    expect(bulkSendIntervalMs()).toBe(Math.ceil(3_600_000 / 7));
  });

  it("fails open when Redis is unavailable", async () => {
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "1";
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    failNextEval.value = true;
    try {
      expect(await checkSendRateLimit("ig_account_1", "direct_message")).toEqual({ allowed: true });
    } finally {
      failNextEval.value = false;
    }
  });

  it("disables the new buckets independently when set to 0", async () => {
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "0";
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "1";
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    for (let i = 0; i < 5; i += 1) {
      expect(await checkSendRateLimit("ig_account_1", "direct_message")).toEqual({ allowed: true });
    }
    expect(await checkSendRateLimit("ig_account_1", "comment_reply")).toEqual({ allowed: true });
    expect((await checkSendRateLimit("ig_account_1", "comment_reply")).allowed).toBe(false);
  });
});

describe("send rate limiter fallback and public-reply guard", () => {
  beforeEach(() => {
    vi.resetModules();
    logged.warn.mockReset();
    failNextEval.value = false;
    process.env.REDIS_URL = "redis://localhost:6379";
    delete (globalThis as { linkarSendRateLimitRedis?: unknown }).linkarSendRateLimitRedis;
  });

  afterEach(() => {
    failNextEval.value = false;
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
    if (originalLimit === undefined) delete process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR;
    else process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR = originalLimit;
    if (originalDmLimit === undefined) delete process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR;
    else process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = originalDmLimit;
    if (originalCommentLimit === undefined) delete process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR;
    else process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = originalCommentLimit;
  });

  async function countAllowed(check: () => Promise<{ allowed: boolean }>, attempts: number): Promise<number> {
    let allowed = 0;
    for (let i = 0; i < attempts; i += 1) {
      if ((await check()).allowed) allowed += 1;
    }
    return allowed;
  }

  it("caps public replies at a quarter of the budget per process when Redis is not configured", async () => {
    delete process.env.REDIS_URL;
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "40";
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    expect(await countAllowed(() => checkSendRateLimit("ig_account_1", "comment_reply"), 20)).toBe(10);
    const blocked = await checkSendRateLimit("ig_account_1", "comment_reply");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterMs).toBeGreaterThan(0);
    // Per account, like the Redis budget.
    expect(await checkSendRateLimit("ig_account_2", "comment_reply")).toEqual({ allowed: true });
  });

  it("caps broadcast sends at a quarter of the bulk share when Redis is not configured", async () => {
    delete process.env.REDIS_URL;
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "100";
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    // Bulk share is 70, a quarter of that is 17.
    expect(await countAllowed(() => checkSendRateLimit("ig_account_1", "direct_message", "bulk"), 40)).toBe(17);
  });

  it("keeps DMs and private replies to people who just wrote working without Redis", async () => {
    delete process.env.REDIS_URL;
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "4";
    process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR = "4";
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    expect(await countAllowed(() => checkSendRateLimit("ig_account_1", "direct_message", "bulk"), 5)).toBe(1);
    expect(await countAllowed(() => checkSendRateLimit("ig_account_1", "direct_message"), 20)).toBe(20);
    expect(await countAllowed(() => checkSendRateLimit("ig_account_1", "private_reply"), 20)).toBe(20);
  });

  it("falls back to the in-process budget when Redis errors, and logs it once per window", async () => {
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "8";
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "8";
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    failNextEval.value = true;
    expect(await countAllowed(() => checkSendRateLimit("ig_account_1", "comment_reply"), 6)).toBe(2);
    // Realtime DMs still go out while Redis is down.
    expect(await countAllowed(() => checkSendRateLimit("ig_account_1", "direct_message"), 6)).toBe(6);
    const fallbackMessages = logged.warn.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes("in-process fallback budget"));
    expect(fallbackMessages).toContain("Send rate limiter is using its in-process fallback budget");
    expect(fallbackMessages.filter((message) => message === "Send rate limiter is using its in-process fallback budget"))
      .toHaveLength(1);
    expect(logged.warn.mock.calls.map(([message]) => String(message)))
      .toContain("Send rate limiter fallback budget is used up for this window");
  });

  it("starts the fallback budget over in the next window", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-16T10:15:00.000Z"));
      delete process.env.REDIS_URL;
      process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "4";
      const { checkSendRateLimit } = await import("./send-rate-limiter");
      expect(await checkSendRateLimit("ig_account_1", "comment_reply")).toEqual({ allowed: true });
      expect((await checkSendRateLimit("ig_account_1", "comment_reply")).allowed).toBe(false);
      vi.setSystemTime(new Date("2026-10-16T11:00:00.000Z"));
      expect(await checkSendRateLimit("ig_account_1", "comment_reply")).toEqual({ allowed: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("peeks at the window's usage without consuming any of it", async () => {
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "5";
    const { checkSendRateLimit, peekSendRateLimit } = await import("./send-rate-limiter");
    expect(await peekSendRateLimit("ig_account_1", "comment_reply")).toMatchObject({
      limited: true, used: 0, max: 5, fallback: false,
    });
    await checkSendRateLimit("ig_account_1", "comment_reply");
    await checkSendRateLimit("ig_account_1", "comment_reply");
    for (let i = 0; i < 3; i += 1) {
      expect(await peekSendRateLimit("ig_account_1", "comment_reply")).toMatchObject({ used: 2, max: 5 });
    }
    const usage = await peekSendRateLimit("ig_account_1", "comment_reply");
    if (usage.limited) {
      expect(usage.retryAfterMs).toBeGreaterThan(0);
      expect(usage.retryAfterMs).toBeLessThanOrEqual(3_600_000);
    }
    // The bulk view of a bucket reports the bulk ceiling.
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "10";
    expect(await peekSendRateLimit("ig_account_1", "direct_message", "bulk")).toMatchObject({ max: 7 });
  });

  it("peek reports unlimited for a disabled bucket and for realtime DMs without Redis", async () => {
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "0";
    const { peekSendRateLimit } = await import("./send-rate-limiter");
    expect(await peekSendRateLimit("ig_account_1", "comment_reply")).toEqual({ limited: false });
    failNextEval.value = true;
    expect(await peekSendRateLimit("ig_account_1", "direct_message")).toEqual({ limited: false });
  });

  it("peek reads the in-process count while Redis is unavailable", async () => {
    delete process.env.REDIS_URL;
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "40";
    const { checkSendRateLimit, peekSendRateLimit } = await import("./send-rate-limiter");
    await checkSendRateLimit("ig_account_1", "comment_reply");
    expect(await peekSendRateLimit("ig_account_1", "comment_reply")).toMatchObject({
      limited: true, used: 1, max: 10, fallback: true,
    });
  });

  it("try-consume shares the check's non-blocking semantics", async () => {
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "1";
    const { tryConsumeSendRateLimit } = await import("./send-rate-limiter");
    expect(await tryConsumeSendRateLimit("ig_account_1", "comment_reply")).toEqual({ allowed: true });
    expect((await tryConsumeSendRateLimit("ig_account_1", "comment_reply")).allowed).toBe(false);
  });

  it("tapers the public reply share from half the budget down to zero", async () => {
    const { publicReplyShare } = await import("./send-rate-limiter");
    expect(publicReplyShare(0, 250)).toBe(1);
    expect(publicReplyShare(124, 250)).toBe(1);
    expect(publicReplyShare(125, 250)).toBe(1);
    expect(publicReplyShare(150, 250)).toBeCloseTo(0.8);
    expect(publicReplyShare(200, 250)).toBeCloseTo(0.4);
    expect(publicReplyShare(249, 250)).toBeCloseTo(0.008);
    expect(publicReplyShare(250, 250)).toBe(0);
    expect(publicReplyShare(400, 250)).toBe(0);
    expect(publicReplyShare(0, 1)).toBe(1);
  });

  it("places each comment at a stable position", async () => {
    const { publicReplyCommentPosition } = await import("./send-rate-limiter");
    const position = publicReplyCommentPosition("comment_1");
    expect(position).toBeGreaterThanOrEqual(0);
    expect(position).toBeLessThan(1);
    expect(publicReplyCommentPosition("comment_1")).toBe(position);
    expect(publicReplyCommentPosition("comment_2")).not.toBe(position);
  });

  it("admits every public reply below half the budget, then a shrinking share, then none", async () => {
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "10";
    const { admitPublicReply, peekSendRateLimit, publicReplyCommentPosition } = await import("./send-rate-limiter");
    // comment_a sits near the start, comment_b near the end.
    expect(publicReplyCommentPosition("comment_a")).toBeLessThan(0.2);
    expect(publicReplyCommentPosition("comment_b")).toBeGreaterThan(0.8);

    for (let i = 0; i < 6; i += 1) {
      expect(await admitPublicReply("ig_account_1", "comment_b")).toEqual({ allowed: true });
    }
    // 6 of 10 used: 80% of comments still get a public reply, but not comment_b.
    expect(await admitPublicReply("ig_account_1", "comment_b")).toEqual({
      allowed: false,
      reason: "public_reply_tapered",
    });
    // A skipped reply does not spend budget.
    expect(await peekSendRateLimit("ig_account_1", "comment_reply")).toMatchObject({ used: 6 });

    for (let i = 0; i < 4; i += 1) {
      expect(await admitPublicReply("ig_account_1", "comment_a")).toEqual({ allowed: true });
    }
    expect(await admitPublicReply("ig_account_1", "comment_a")).toEqual({
      allowed: false,
      reason: "public_reply_hourly_limit",
    });
    // Other accounts keep their own budget.
    expect(await admitPublicReply("ig_account_2", "comment_b")).toEqual({ allowed: true });
  });

  it("admits public replies freely when the bucket is disabled", async () => {
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "0";
    const { admitPublicReply } = await import("./send-rate-limiter");
    for (let i = 0; i < 20; i += 1) {
      expect(await admitPublicReply("ig_account_1", "comment_b")).toEqual({ allowed: true });
    }
  });

  it("guards public replies with the fallback budget when Redis is down", async () => {
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "8";
    const { admitPublicReply } = await import("./send-rate-limiter");
    failNextEval.value = true;
    expect(await admitPublicReply("ig_account_1", "comment_a")).toEqual({ allowed: true });
    expect(await admitPublicReply("ig_account_1", "comment_a")).toEqual({ allowed: true });
    expect(await admitPublicReply("ig_account_1", "comment_a")).toEqual({
      allowed: false,
      reason: "public_reply_hourly_limit",
    });
  });

  it("logs a Redis outage once per account and window, not once per public reply", async () => {
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "8";
    const { admitPublicReply } = await import("./send-rate-limiter");
    failNextEval.value = true;
    for (let i = 0; i < 50; i += 1) await admitPublicReply("ig_account_1", `comment_${i}`);

    const messages = logged.warn.mock.calls.map(([message]) => String(message));
    expect(messages).toEqual([
      "Send rate limiter is using its in-process fallback budget",
      "Send rate limiter fallback budget is used up for this window",
    ]);
    // The once-per-window message still says why the fallback is in use.
    expect(logged.warn.mock.calls[0]?.[1]).toMatchObject({
      accountId: "ig_account_1",
      bucket: "comment_reply",
      reason: "redis_unavailable",
      error: "connection is closed",
    });

    // Another account gets its own single notice.
    await admitPublicReply("ig_account_2", "comment_x");
    expect(logged.warn).toHaveBeenCalledTimes(3);
  });

  it("still warns on every realtime DM let through while Redis errors", async () => {
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "8";
    const { checkSendRateLimit } = await import("./send-rate-limiter");
    failNextEval.value = true;
    expect(await checkSendRateLimit("ig_account_1", "direct_message")).toEqual({ allowed: true });
    expect(await checkSendRateLimit("ig_account_1", "direct_message")).toEqual({ allowed: true });
    expect(logged.warn.mock.calls.map(([message]) => String(message))).toEqual([
      "Send rate limiter unavailable; allowing the send",
      "Send rate limiter unavailable; allowing the send",
    ]);
  });

  it("explains skipped public replies in plain words", async () => {
    const { publicReplySkipMessage } = await import("./send-rate-limiter");
    for (const reason of ["public_reply_hourly_limit", "public_reply_tapered"] as const) {
      const message = publicReplySkipMessage(reason);
      expect(message.length).toBeGreaterThan(0);
      // Activity already shows the "Skipped" status in front of the reason.
      expect(message).not.toMatch(/skipped/i);
      expect(message).not.toMatch(/\u2014|payload|recipient|webhook/i);
    }
  });

  it("matches the words Facebook Activity shows for a skipped public reply", async () => {
    // The client component cannot import this server module, so it keeps its
    // own copy of the labels. This keeps the two from drifting apart.
    const { readFileSync } = await import("node:fs");
    const { publicReplySkipMessage } = await import("./send-rate-limiter");
    const activitySource = readFileSync(
      new URL("../../components/automation-activity.tsx", import.meta.url),
      "utf8",
    );
    for (const reason of ["public_reply_hourly_limit", "public_reply_tapered"] as const) {
      expect(activitySource).toContain(`${reason}: ${JSON.stringify(publicReplySkipMessage(reason))}`);
    }
  });
});
