import { afterEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ created: vi.fn(), ping: vi.fn(), disconnect: vi.fn() }));
vi.mock("ioredis", () => ({
  default: class Redis {
    constructor(url: string) { redis.created(url); }
    ping = redis.ping;
    disconnect = redis.disconnect;
  },
}));

const { getHealth } = await import("./health");

afterEach(() => {
  const cache = globalThis as { linkarHealthRedis?: { disconnect: () => void }; linkarHealthRedisUrl?: string; linkarHealthRedisPending?: Promise<unknown> };
  cache.linkarHealthRedis?.disconnect();
  delete cache.linkarHealthRedis;
  delete cache.linkarHealthRedisUrl;
  delete cache.linkarHealthRedisPending;
  redis.created.mockReset();
  redis.ping.mockReset();
  redis.disconnect.mockReset();
  vi.unstubAllEnvs();
});

describe("Redis health probe", () => {
  it("reuses its connection across probes and replaces it when the URL changes", async () => {
    redis.ping.mockResolvedValue("PONG");
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://first:6379");

    await getHealth({ database: async () => undefined });
    await getHealth({ database: async () => undefined });
    expect(redis.created).toHaveBeenCalledTimes(1);
    expect(redis.ping).toHaveBeenCalledTimes(2);

    vi.stubEnv("REDIS_URL", "redis://second:6379");
    await getHealth({ database: async () => undefined });
    expect(redis.created).toHaveBeenCalledTimes(2);
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
  });

  it("creates only one connection for concurrent cold probes", async () => {
    redis.ping.mockResolvedValue("PONG");
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://first:6379");

    await Promise.all([
      getHealth({ database: async () => undefined }),
      getHealth({ database: async () => undefined }),
    ]);

    expect(redis.created).toHaveBeenCalledTimes(1);
    expect(redis.ping).toHaveBeenCalledTimes(2);
  });
});
