import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  setPaused: vi.fn(),
  retry: vi.fn(),
  listFailed: vi.fn(),
  maintenance: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/queue", () => ({ ADMIN_QUEUE_NAMES: ["webhooks"], setAdminQueuePaused: mocks.setPaused, retryAdminQueueJobs: mocks.retry, listAdminFailedJobs: mocks.listFailed, enqueueAdminMaintenance: mocks.maintenance }));
const { executeQueueCommand, executeSystemCommand, listQueueFailedJobs } = await import("./commands");
const { AdminWorkspaceError } = await import("../workspace-service");
describe("system commands", () => {
  it("rejects unknown queue names", async () => { await expect(executeQueueCommand("__proto__", { action: "pause" })).rejects.toMatchObject({ code: "unknown_queue" }); });
  it("queues bounded maintenance rather than scanning inside HTTP", async () => { mocks.maintenance.mockResolvedValue(true); await expect(executeSystemCommand("run_delivery_reconciliation")).resolves.toEqual({ action: "run_delivery_reconciliation", queued: true }); });
  it("reports a maintenance queue that is not ready as unavailable, not as a generic failure", async () => {
    // enqueueAdminMaintenance throws queue_unavailable when Valkey does not answer in time.
    mocks.maintenance.mockRejectedValueOnce(new Error("queue_unavailable"));
    const error = await executeSystemCommand("run_usage_reconciliation").catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AdminWorkspaceError);
    expect(error).toMatchObject({ status: 503, code: "maintenance_queue_unavailable" });
    expect(mocks.maintenance).toHaveBeenLastCalledWith("usage_reconciliation");
    // Same shape as a queue that is not configured at all.
    mocks.maintenance.mockResolvedValueOnce(false);
    await expect(executeSystemCommand("run_delivery_reconciliation")).rejects.toMatchObject({ status: 503, code: "maintenance_queue_unavailable" });
    // Anything unexpected still reaches the route's generic handler untouched.
    const unexpected = new Error("redis://user:secret@host refused");
    mocks.maintenance.mockRejectedValueOnce(unexpected);
    await expect(executeSystemCommand("run_delivery_reconciliation")).rejects.toBe(unexpected);
  });
  it("translates async retry failures into safe codes", async () => {
    // Without awaiting inside the try, these rejections escaped as raw Errors (500).
    mocks.retry.mockRejectedValueOnce(new Error("job_not_failed"));
    await expect(executeQueueCommand("webhooks", { action: "retry_failed_jobs", jobIds: ["j1"] })).rejects.toMatchObject({ status: 409, code: "job_not_failed" });
    mocks.retry.mockRejectedValueOnce(new Error("redis://user:secret@host refused"));
    await expect(executeQueueCommand("webhooks", { action: "retry_failed_jobs", jobIds: ["j1"] })).rejects.toMatchObject({ status: 409, code: "queue_command_failed" });
  });
  it("translates async pause failures into safe codes", async () => {
    mocks.setPaused.mockRejectedValueOnce(new Error("queue_unavailable"));
    await expect(executeQueueCommand("webhooks", { action: "pause" })).rejects.toMatchObject({ status: 503, code: "queue_unavailable" });
  });
  it("lists failed jobs for allowlisted queues only", async () => {
    mocks.listFailed.mockResolvedValueOnce([{ id: "j1", name: "instagram-event", failedAt: null, attemptsMade: 3, code: "ERROR_RECORDED" }]);
    await expect(listQueueFailedJobs("webhooks")).resolves.toHaveLength(1);
    await expect(listQueueFailedJobs("other")).rejects.toMatchObject({ status: 404, code: "unknown_queue" });
    mocks.listFailed.mockRejectedValueOnce(new Error("queue_unavailable"));
    await expect(listQueueFailedJobs("webhooks")).rejects.toMatchObject({ status: 503, code: "queue_unavailable" });
  });
});
