import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), failed: vi.fn(), cancel: vi.fn(), retry: vi.fn(), existing: vi.fn(), active: vi.fn(), job: vi.fn(), create: vi.fn(), preview: vi.fn(), matches: vi.fn(), consume: vi.fn() }));
vi.mock("@/src/lib/queue", () => ({ enqueueAdminDeletion: mocks.enqueue }));
vi.mock("./repository", () => ({ markDeletionEnqueueFailed: mocks.failed, requestDeletionCancellation: mocks.cancel, resetFailedDeletion: mocks.retry, getDeletionJobByIdempotencyKey: mocks.existing, createDeletionJob: mocks.create, findActiveDeletionJob: mocks.active, getDeletionJob: mocks.job }));
vi.mock("./impact", () => ({ previewDeletion: mocks.preview, deletionImpactMatches: mocks.matches }));
vi.mock("../challenges", () => ({ consumeAdminChallenge: mocks.consume, createAdminChallenge: vi.fn() }));
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

const request = { target: { kind: "WORKSPACE" as const, id: "workspace" }, impactDigest: "digest", includeAuthUsers: false, confirmation: "DELETE WORKSPACE workspace", challengeToken: "token", context: { idempotencyKey: "fresh", owner: { userId: "owner", sessionId: "s" } } as never };
it("rejects a second deletion for a target with an active job before spending the challenge", async () => {
  mocks.existing.mockResolvedValue(null);
  mocks.active.mockResolvedValue({ id: "other", state: "RUNNING" });
  await expect(requestPermanentDeletion(request)).rejects.toMatchObject({ status: 409, code: "deletion_already_active" });
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("queues a deletion whose structural digest still matches", async () => {
  mocks.existing.mockResolvedValue(null);
  mocks.active.mockResolvedValue(null);
  mocks.preview.mockResolvedValue({ impactDigest: "digest", confirmationPhrase: "DELETE WORKSPACE workspace", impact: {} });
  mocks.create.mockResolvedValue({ id: "job", version: 1 });
  await expect(requestPermanentDeletion(request)).resolves.toMatchObject({ id: "job" });
  expect(mocks.consume).toHaveBeenCalledOnce();
  expect(mocks.enqueue).toHaveBeenCalledWith("job");
});
it("revalidates a retried job that never passed validation", async () => {
  mocks.job.mockResolvedValue({ id: "job", targetKind: "WORKSPACE", targetId: "workspace", impact: { version: 2 }, impactDigest: "old", stages: [{ stage: "VALIDATE", state: "FAILED" }] });
  mocks.preview.mockResolvedValue({ impactDigest: "new" });
  mocks.matches.mockReturnValue(false);
  await expect(changeDeletionJob("job", "retry", { owner: { userId: "owner" } } as never)).rejects.toMatchObject({ status: 409, code: "impact_changed" });
  expect(mocks.retry).not.toHaveBeenCalled();
});
it("retries a job past validation without re-previewing it", async () => {
  mocks.job.mockResolvedValue({ id: "job", targetKind: "WORKSPACE", targetId: "workspace", stages: [{ stage: "VALIDATE", state: "COMPLETED" }] });
  mocks.retry.mockResolvedValue({ id: "job", version: 5 });
  await changeDeletionJob("job", "retry", { owner: { userId: "owner" } } as never);
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.enqueue).toHaveBeenCalledWith("job");
});
