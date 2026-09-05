import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  loadInventory: vi.fn(),
  createChallenge: vi.fn(),
  consumeChallenge: vi.fn(),
  createJob: vi.fn(),
  getByIdempotencyKey: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("./synthetic-inventory", () => ({
  loadSyntheticAccountInventory: mocks.loadInventory,
}));
vi.mock("../challenges", () => ({
  createAdminChallenge: mocks.createChallenge,
  consumeAdminChallenge: mocks.consumeChallenge,
}));
vi.mock("./repository", () => ({
  createDeletionJob: mocks.createJob,
  getDeletionJobByIdempotencyKey: mocks.getByIdempotencyKey,
}));
vi.mock("@/src/lib/queue", () => ({ enqueueAdminDeletion: mocks.enqueue }));

import { prepareSyntheticAccountCleanup, requestSyntheticAccountCleanup } from "./synthetic-cleanup";

describe("synthetic account cleanup preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadInventory.mockResolvedValue({
      count: 2,
      accounts: [
        { userId: "user_1", email: "owner-1@example.com", membershipCount: 1, ownedWorkspaceIds: ["workspace_1"] },
        { userId: "user_2", email: "member-2@example.com", membershipCount: 0, ownedWorkspaceIds: [] },
      ],
      excludedProtectedCount: 0,
      membershipCount: 1,
      ownedWorkspaceCount: 1,
      unsafeOwnedWorkspaceCount: 0,
      digest: "a".repeat(64),
    });
    mocks.createChallenge.mockResolvedValue({ token: "challenge-token", expiresAt: "2026-09-05T20:00:00.000Z" });
    mocks.consumeChallenge.mockResolvedValue(undefined);
    mocks.createJob.mockResolvedValue({ id: "del_batch", state: "QUEUED", targetKind: "SYNTHETIC_ACCOUNTS", targetId: "approved-test-patterns" });
    mocks.getByIdempotencyKey.mockResolvedValue(null);
    mocks.enqueue.mockResolvedValue(true);
  });

  it("rechecks the exact inventory before consuming the challenge and queuing one durable batch", async () => {
    const context = {
      owner: { userId: "admin_1", email: "admin@example.com", sessionId: "session_1" },
      reason: "remove generated test accounts",
      idempotencyKey: "synthetic-delete-123456",
    } as never;

    const job = await requestSyntheticAccountCleanup({
      impactDigest: "a".repeat(64),
      confirmation: "DELETE 2 SYNTHETIC ACCOUNTS",
      challengeToken: "challenge-token",
      context,
    });

    expect(mocks.consumeChallenge).toHaveBeenCalledBefore(mocks.createJob);
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({
      target: { kind: "SYNTHETIC_ACCOUNTS", id: "approved-test-patterns" },
      includeAuthUsers: true,
      preview: expect.objectContaining({ impactDigest: "a".repeat(64) }),
    }));
    expect(mocks.enqueue).toHaveBeenCalledWith("del_batch");
    expect(job).toMatchObject({ id: "del_batch" });
  });

  it("rejects a stale digest before consuming the challenge", async () => {
    const context = {
      owner: { userId: "admin_1", email: "admin@example.com", sessionId: "session_1" },
      reason: "remove generated test accounts",
      idempotencyKey: "synthetic-delete-123456",
    } as never;

    await expect(requestSyntheticAccountCleanup({
      impactDigest: "b".repeat(64),
      confirmation: "DELETE 2 SYNTHETIC ACCOUNTS",
      challengeToken: "challenge-token",
      context,
    })).rejects.toMatchObject({ status: 409, code: "impact_changed" });
    expect(mocks.consumeChallenge).not.toHaveBeenCalled();
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("binds a single-use challenge to the fixed approved-pattern inventory", async () => {
    const result = await prepareSyntheticAccountCleanup({ userId: "admin_1", sessionId: "session_1" });

    expect(mocks.createChallenge).toHaveBeenCalledWith({
      userId: "admin_1",
      sessionId: "session_1",
      action: "synthetic_cleanup.create",
      targetType: "SYNTHETIC_ACCOUNTS",
      targetId: "approved-test-patterns",
      expectedVersion: "a".repeat(64),
      confirmation: "DELETE 2 SYNTHETIC ACCOUNTS",
    });
    expect(result).toMatchObject({
      count: 2,
      membershipsAffected: 1,
      ownedWorkspacesAffected: 1,
      protectedAccountsExcluded: 0,
      digest: "a".repeat(64),
      confirmationPhrase: "DELETE 2 SYNTHETIC ACCOUNTS",
    });
  });

  it("does not return account email addresses or user ids to the browser", async () => {
    const result = await prepareSyntheticAccountCleanup({ userId: "admin_1", sessionId: "session_1" });

    expect(JSON.stringify(result)).not.toContain("owner-1@example.com");
    expect(JSON.stringify(result)).not.toContain("user_1");
  });

  it("refuses to prepare cleanup when a synthetic workspace contains a genuine member", async () => {
    mocks.loadInventory.mockResolvedValueOnce({
      count: 1,
      accounts: [{ userId: "user_1", email: "owner-1@example.com", membershipCount: 1, ownedWorkspaceIds: ["workspace_1"] }],
      excludedProtectedCount: 0,
      membershipCount: 1,
      ownedWorkspaceCount: 1,
      unsafeOwnedWorkspaceCount: 1,
      digest: "b".repeat(64),
    });

    await expect(prepareSyntheticAccountCleanup({ userId: "admin_1", sessionId: "session_1" }))
      .rejects.toMatchObject({ status: 409, code: "shared_test_workspace_requires_review" });
    expect(mocks.createChallenge).not.toHaveBeenCalled();
  });
});
