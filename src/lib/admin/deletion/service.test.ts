import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), failed: vi.fn(), cancel: vi.fn(), retry: vi.fn(), existing: vi.fn() }));
vi.mock("@/src/lib/queue", () => ({ enqueueAdminDeletion: mocks.enqueue }));
vi.mock("./repository", () => ({ markDeletionEnqueueFailed: mocks.failed, requestDeletionCancellation: mocks.cancel, resetFailedDeletion: mocks.retry, getDeletionJobByIdempotencyKey: mocks.existing, createDeletionJob: vi.fn() }));
vi.mock("./impact", () => ({ previewDeletion: vi.fn() }));
vi.mock("../challenges", () => ({ consumeAdminChallenge: vi.fn(), createAdminChallenge: vi.fn() }));
const { queueDeletionJob, changeDeletionJob, requestPermanentDeletion } = await import("./service");
beforeEach(() => { vi.resetAllMocks(); mocks.enqueue.mockResolvedValue(true); });
it("persists queue failure against the expected job version for recovery", async () => {
  mocks.enqueue.mockRejectedValue(new Error("redis password must not escape"));
  await expect(queueDeletionJob({ id: "job", version: 3 })).rejects.toMatchObject({ status: 503, code: "deletion_queue_unavailable" });
  expect(mocks.failed).toHaveBeenCalledWith("job", 3);
});
it("queues cancellation so a retained failed worker job can finish cleanup", async () => {
  mocks.cancel.mockResolvedValue({ id: "job", version: 4 });
  await changeDeletionJob("job", "cancel", { owner: { userId: "owner" } } as never);
  expect(mocks.enqueue).toHaveBeenCalledWith("job");
});
it.each([{ requestedByUserId: "another" }, { includeAuthUsers: false }])("rejects a replay whose actor or destructive scope changed", async (patch) => {
  mocks.existing.mockResolvedValue({ targetKind: "WORKSPACE", targetId: "workspace", impactDigest: "digest", requestedByUserId: "owner", includeAuthUsers: true, ...patch });
  await expect(requestPermanentDeletion({ target: { kind: "WORKSPACE", id: "workspace" }, impactDigest: "digest", includeAuthUsers: true, confirmation: "", challengeToken: "", context: { idempotencyKey: "same", owner: { userId: "owner" } } as never })).rejects.toMatchObject({ code: "idempotency_conflict" });
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
