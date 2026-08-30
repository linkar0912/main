import { describe, expect, it } from "vitest";

import {
  AdminChallengeError,
  createAdminChallenge,
  consumeAdminChallenge,
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
});
