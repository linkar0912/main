import { describe, expect, it, vi } from "vitest";

// A Redis stand-in with real INCR/PEXPIRE semantics for the consume script,
// whose round trips yield to the event loop like a network call would.
const store = vi.hoisted(() => new Map<string, number>());
vi.mock("ioredis", () => ({
  default: class FakeRedis {
    async get(key: string) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return store.has(key) ? String(store.get(key)) : null;
    }
    async eval(_script: string, _keys: number, key: string) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    }
    async del(key: string) {
      store.delete(key);
      return 1;
    }
  },
}));

const { LoginRateLimitStore, loginRateLimitKey, networkRateLimitKey } = await import("./rate-limit");

describe("LoginRateLimitStore.consume", () => {
  it("admits exactly the limit when many attempts race (Redis)", async () => {
    store.clear();
    const limiter = new LoginRateLimitStore("redis://limiter.test:6379", 5);
    const results = await Promise.all(Array.from({ length: 20 }, () => limiter.consume("victim")));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it("the old check-then-record pattern let every racing attempt through", async () => {
    // Documents the bug consume() replaces: all reads see the same count.
    store.clear();
    const limiter = new LoginRateLimitStore("redis://limiter.test:6379", 5);
    const results = await Promise.all(Array.from({ length: 20 }, async () => {
      const allowed = await limiter.isAllowed("victim");
      await limiter.recordFailure("victim");
      return allowed;
    }));
    expect(results.filter(Boolean).length).toBeGreaterThan(5);
  });

  it("admits exactly the limit with the in-process fallback", async () => {
    const limiter = new LoginRateLimitStore(undefined, 3);
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.consume("someone")));
    expect(results.filter(Boolean)).toHaveLength(3);
    await limiter.reset("someone");
    expect(await limiter.consume("someone")).toBe(true);
  });
});

describe("rate-limit keys", () => {
  it("keys the lockout on email and network together", () => {
    const secret = "test-secret-at-least-32-characters";
    expect(loginRateLimitKey(secret, "a@example.com", "198.51.100.1"))
      .not.toBe(loginRateLimitKey(secret, "a@example.com", "198.51.100.2"));
  });

  it("has no per-network bucket when the client address is unknown", () => {
    const secret = "test-secret-at-least-32-characters";
    expect(networkRateLimitKey(secret, "login", "unknown")).toBeNull();
    expect(networkRateLimitKey(secret, "login", "198.51.100.1")).toMatch(/^[0-9a-f]{64}$/);
  });
});
