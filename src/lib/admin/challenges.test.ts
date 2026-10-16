import { describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  constructed: [] as Array<{ url: string; options: Record<string, unknown> }>,
  set: vi.fn(async () => "OK"),
}));

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    set = redis.set;
    eval = vi.fn();
    constructor(url: string, options: Record<string, unknown>) {
      redis.constructed.push({ url, options });
    }
  },
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ redisUrl: "redis://challenges.test:6379", adminChallengeTtlSeconds: undefined }),
}));

vi.mock("@/src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  AdminChallengeError,
  createAdminChallenge,
  consumeAdminChallenge,
  RedisAdminChallengeStore,
  type AdminChallengeRecord,
  type AdminChallengeStore,
} from "./challenges";

class MemoryChallengeStore implements AdminChallengeStore {
  private readonly records = new Map<string, AdminChallengeRecord>();

  async put(tokenHash: string, record: AdminChallengeRecord): Promise<boolean> {
    if (this.records.has(tokenHash)) return false;
    this.records.set(tokenHash, record);
    return true;
  }

  async consume(tokenHash: string, expected: AdminChallengeRecord) {
    const current = this.records.get(tokenHash);
    if (!current) return "missing" as const;
    if (JSON.stringify(current) !== JSON.stringify(expected)) return "mismatch" as const;
    this.records.delete(tokenHash);
    return "consumed" as const;
  }
}

const binding = {
  userId: "11111111-1111-4111-8111-111111111111",
  sessionId: "session-1",
  action: "workspace.delete",
  targetType: "workspace",
  targetId: "workspace-1",
  expectedVersion: "7",
  confirmation: "DELETE WORKSPACE ACME",
};

describe("admin confirmation challenges", () => {
  it("consumes an exact action/target/session challenge only once", async () => {
    const store = new MemoryChallengeStore();
    const challenge = await createAdminChallenge(binding, {
      store,
      now: () => new Date("2026-08-31T10:00:00.000Z"),
      randomToken: () => "one-time-random-token",
    });

    expect(challenge).toEqual({
      token: "one-time-random-token",
      expiresAt: "2026-08-31T10:10:00.000Z",
    });
    await expect(consumeAdminChallenge({ ...binding, token: challenge.token }, { store })).resolves.toBeUndefined();
    await expect(consumeAdminChallenge({ ...binding, token: challenge.token }, { store })).rejects.toEqual(
      new AdminChallengeError(409, "challenge_missing"),
    );
  });

  it("does not consume a challenge with a different target binding", async () => {
    const store = new MemoryChallengeStore();
    const challenge = await createAdminChallenge(binding, {
      store,
      randomToken: () => "bound-random-token",
    });

    await expect(
      consumeAdminChallenge({ ...binding, targetId: "workspace-2", token: challenge.token }, { store }),
    ).rejects.toMatchObject({ status: 403, code: "challenge_mismatch" });
    await expect(consumeAdminChallenge({ ...binding, token: challenge.token }, { store })).resolves.toBeUndefined();
  });

  it("gives its Redis client a command timeout so a stalled Valkey fails fast", async () => {
    await createAdminChallenge(binding, { randomToken: () => "default-store-token" });

    expect(redis.constructed).toEqual([{
      url: "redis://challenges.test:6379",
      options: expect.objectContaining({ connectTimeout: 3_000, commandTimeout: 1_500 }),
    }]);
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  it("answers 503 challenge_unavailable when Redis fails or times out, instead of a bare error", async () => {
    const timedOut = new Error("Command timed out");
    const store = new RedisAdminChallengeStore({
      set: vi.fn(async () => { throw timedOut; }),
      eval: vi.fn(async () => { throw timedOut; }),
    } as unknown as ConstructorParameters<typeof RedisAdminChallengeStore>[0]);

    await expect(createAdminChallenge(binding, { store, randomToken: () => "stalled-token" })).rejects.toEqual(
      new AdminChallengeError(503, "challenge_unavailable"),
    );
    await expect(consumeAdminChallenge({ ...binding, token: "stalled-token" }, { store })).rejects.toMatchObject({
      status: 503,
      code: "challenge_unavailable",
    });
  });
});
