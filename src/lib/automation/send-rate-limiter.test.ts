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
}

vi.mock("ioredis", () => ({ default: FakeRedis }));

const originalRedisUrl = process.env.REDIS_URL;
const originalLimit = process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR;
const originalDmLimit = process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR;
const originalCommentLimit = process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR;

describe("checkSendRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
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
