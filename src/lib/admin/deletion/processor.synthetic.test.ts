import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  jobFind: vi.fn(),
  jobUpdate: vi.fn(),
  jobUpdateMany: vi.fn(),
  stageFind: vi.fn(),
  stageUpdate: vi.fn(),
  workspaceUpdateMany: vi.fn(),
  workspaceDeleteMany: vi.fn(),
  memberDeleteMany: vi.fn(),
  controlDeleteMany: vi.fn(),
  transaction: vi.fn(),
  deleteQueuedBatch: vi.fn(),
  loadInventory: vi.fn(),
  getUserById: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ platformOwnerUserIds: ["protected_admin"] }) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  adminDeletionJob: { findUnique: mocks.jobFind, update: mocks.jobUpdate, updateMany: mocks.jobUpdateMany },
  adminDeletionStage: { findUnique: mocks.stageFind, update: mocks.stageUpdate },
  workspace: { updateMany: mocks.workspaceUpdateMany, deleteMany: mocks.workspaceDeleteMany },
  workspaceMember: { deleteMany: mocks.memberDeleteMany, count: vi.fn() },
  platformUserControl: { deleteMany: mocks.controlDeleteMany },
  $transaction: mocks.transaction,
} }));
vi.mock("@/src/lib/queue", () => ({ deleteQueuedWorkspaceEventsBatch: mocks.deleteQueuedBatch }));
vi.mock("@/src/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ auth: { admin: {
  getUserById: mocks.getUserById,
  deleteUser: mocks.deleteUser,
} } }) }));
vi.mock("./synthetic-inventory", () => ({ loadSyntheticAccountInventory: mocks.loadInventory }));
vi.mock("./impact", () => ({ previewDeletion: vi.fn() }));

import { processAdminDeletion } from "./processor";

describe("synthetic deletion processor", () => {
  const impact = {
    version: 1,
    target: { kind: "SYNTHETIC_ACCOUNTS", id: "approved-test-patterns" },
    identity: { label: "1 approved synthetic account" },
    counts: { accounts: 1, memberships: 1, ownedWorkspaces: 1 },
    memberUserIds: ["user_1"],
    warnings: [],
    syntheticAccounts: [{
      userId: "user_1",
      email: "owner-1@example.com",
      membershipCount: 1,
      ownedWorkspaceIds: ["workspace_1"],
    }],
  };
  const job = {
    id: "del_batch",
    state: "QUEUED",
    targetKind: "SYNTHETIC_ACCOUNTS",
    targetId: "approved-test-patterns",
    impact,
    impactDigest: "a".repeat(64),
    includeAuthUsers: true,
    startedAt: null,
    cancelRequestedAt: null,
    irreversibleAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobFind.mockResolvedValue(job);
    mocks.jobUpdate.mockResolvedValue(job);
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.stageFind.mockResolvedValue(null);
    mocks.stageUpdate.mockResolvedValue({});
    mocks.workspaceUpdateMany.mockResolvedValue({ count: 1 });
    mocks.workspaceDeleteMany.mockResolvedValue({ count: 1 });
    mocks.memberDeleteMany.mockResolvedValue({ count: 0 });
    mocks.controlDeleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
    mocks.deleteQueuedBatch.mockResolvedValue(undefined);
    mocks.loadInventory.mockResolvedValue({ digest: "a".repeat(64), unsafeOwnedWorkspaceCount: 0 });
    mocks.getUserById.mockResolvedValue({ data: { user: { id: "user_1", email: "owner-1@example.com" } }, error: null });
    mocks.deleteUser.mockResolvedValue({ error: null });
  });

  it("clears queued work once, revalidates twice, and removes workspaces before Auth users", async () => {
    await expect(processAdminDeletion("del_batch")).resolves.toEqual({ state: "COMPLETED" });

    expect(mocks.deleteQueuedBatch).toHaveBeenCalledWith(["workspace_1"]);
    expect(mocks.loadInventory).toHaveBeenCalledTimes(2);
    expect(mocks.getUserById).toHaveBeenCalledWith("user_1");
    expect(mocks.workspaceDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteUser.mock.invocationCallOrder[0]);
    // Memberships never linked to a user id are matched by the stored account email.
    expect(mocks.memberDeleteMany).toHaveBeenCalledWith({ where: { OR: [{ userId: { in: ["user_1"] } }, { userId: null, email: { in: ["owner-1@example.com"] } }] } });
  });

  it("preserves an Auth identity whose email changed after tenant cleanup", async () => {
    mocks.getUserById.mockResolvedValueOnce({ data: { user: { id: "user_1", email: "person@gmail.com" } }, error: null });

    await expect(processAdminDeletion("del_batch")).rejects.toThrow("auth_identity_changed");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("honors cancellation that arrives between the last check and the irreversible update", async () => {
    let cancelled = false;
    mocks.jobFind.mockImplementation(async () => cancelled ? { ...job, cancelRequestedAt: new Date() } : job);
    mocks.jobUpdateMany.mockImplementation(async () => { cancelled = true; return { count: 0 }; });
    await expect(processAdminDeletion("del_batch")).resolves.toEqual({ state: "CANCELLED" });
    expect(mocks.workspaceDeleteMany).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.jobUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "del_batch", irreversibleAt: null, cancelRequestedAt: null } }));
  });

  it("does not expose raw infrastructure errors in durable job or stage codes", async () => {
    mocks.deleteQueuedBatch.mockRejectedValueOnce(new Error("redis://username:private-token@example.com"));
    await expect(processAdminDeletion("del_batch")).rejects.toThrow("private-token");
    const recorded = JSON.stringify([...mocks.jobUpdate.mock.calls, ...mocks.stageUpdate.mock.calls]);
    expect(recorded).not.toContain("private-token");
    expect(recorded).toContain("DELETION_STAGE_FAILED");
    expect(mocks.workspaceUpdateMany).toHaveBeenCalledBefore(mocks.deleteQueuedBatch);
  });

});
