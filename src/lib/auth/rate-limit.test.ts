import { createServer, type AddressInfo, type Socket } from "node:net";
import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";

// A Redis stand-in with real INCR/PEXPIRE semantics for the consume script,
// whose round trips yield to the event loop like a network call would. A URL
// on any other host gets the real ioredis client, for the timeout test.
const store = vi.hoisted(() => new Map<string, number>());
const constructed = vi.hoisted(() => [] as Array<{ url: string; options: Record<string, unknown> }>);
vi.mock("ioredis", async () => {
  const actual = await vi.importActual<typeof import("ioredis")>("ioredis");
  class FakeRedis {
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
  }
  return {
    default: class RedisSwitch {
      constructor(url: string, options: Record<string, unknown>) {
        constructed.push({ url, options });
        return url.includes("limiter.test") ? new FakeRedis() : new actual.default(url, options);
      }
    },
  };
});

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

  it("keeps separately namespaced limiters apart in Redis", async () => {
    // Login, signup and forgot-password share a key shape (email + network);
    // spending the reset budget must not lock the same visitor out of sign-in.
    store.clear();
    const forgot = new LoginRateLimitStore("redis://limiter.test:6379", 2, 60_000, "forgot-password");
    const login = new LoginRateLimitStore("redis://limiter.test:6379", 2);
    await forgot.consume("visitor");
    await forgot.consume("visitor");
    expect(await forgot.consume("visitor")).toBe(false);
    expect(await login.consume("visitor")).toBe(true);
    expect([...store.keys()].sort()).toEqual(["linkar:forgot-password:visitor", "linkar:login:visitor"]);
  });

  it("admits exactly the limit with the in-process fallback", async () => {
    const limiter = new LoginRateLimitStore(undefined, 3);
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.consume("someone")));
    expect(results.filter(Boolean)).toHaveLength(3);
    await limiter.reset("someone");
    expect(await limiter.consume("someone")).toBe(true);
  });
});

describe("LoginRateLimitStore when Redis stalls", () => {
  it("falls back in-process within about 2 s when Redis accepts the connection but never answers", async () => {
    // A stalled Valkey: the TCP connection opens, nothing ever comes back.
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `redis://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const limiter = new LoginRateLimitStore(url, 1);
    try {
      expect(constructed).toContainEqual({ url, options: expect.objectContaining({ connectTimeout: 3_000, commandTimeout: 1_500 }) });

      const started = performance.now();
      expect(await limiter.consume("visitor")).toBe(true);
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(1_400);
      expect(elapsed).toBeLessThan(2_500);

      // The fallback recorded that attempt, so the one-attempt limit holds.
      expect(await limiter.isAllowed("visitor")).toBe(false);
    } finally {
      (limiter as unknown as { redis: Redis }).redis.disconnect();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
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
