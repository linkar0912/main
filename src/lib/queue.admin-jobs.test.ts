import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobsOptions } from "bullmq";
const mocks = vi.hoisted(() => ({ add: vi.fn(), getJob: vi.fn() }));
vi.mock("./env", () => ({ getServerEnv: () => ({ redisUrl: "redis://unused.test", deletionJobAttempts: 3, deletionJobBackoffMs: 1000 }) }));
vi.mock("ioredis", () => ({ default: class Redis {} }));
vi.mock("bullmq", async (importOriginal) => ({ ...await importOriginal<typeof import("bullmq")>(), Queue: class { add = mocks.add; getJob = mocks.getJob; } }));
const { Job } = await import("bullmq");
const { enqueueAdminMaintenance, enqueueAdminDeletion } = await import("./queue");
beforeEach(() => {
  delete (globalThis as { linkarWebhookQueue?: unknown }).linkarWebhookQueue;
  vi.clearAllMocks(); mocks.getJob.mockResolvedValue(null);
  // Use the installed BullMQ validator: no Redis connection or permissive Queue mock validation.
  mocks.add.mockImplementation(async (_name: string, _data: unknown, opts: JobsOptions) => {
    (Job.prototype as unknown as { validateOptions: (data: { data: string }) => void }).validateOptions.call({ opts, name: "test" }, { data: "{}" });
  });
});
describe("admin queue jobs", () => {
  it("accepts maintenance and deletion IDs under the real BullMQ validation contract", async () => {
    await expect(enqueueAdminMaintenance("delivery_reconciliation")).resolves.toBe(true);
    await expect(enqueueAdminDeletion("deletion:with:separators")).resolves.toBe(true);
    const deletionId = mocks.add.mock.calls[1][2].jobId;
    expect(deletionId).not.toContain(":");
    expect(mocks.getJob).toHaveBeenCalledWith(deletionId);
    await enqueueAdminDeletion("deletion:with:separators");
    expect(mocks.add.mock.calls[2][2].jobId).toBe(deletionId);
  });
  it("retries failed reconciliation jobs so a previous failure cannot block future commands", async () => {
    const retry = vi.fn(); mocks.getJob.mockResolvedValue({ getState: async () => "failed", retry });
    await enqueueAdminMaintenance("usage_reconciliation");
    expect(retry).toHaveBeenCalledWith("failed"); expect(mocks.add).not.toHaveBeenCalled();
  });
  it("retries an existing failed deletion job instead of adding a duplicate", async () => {
    const retry = vi.fn(); mocks.getJob.mockResolvedValue({ getState: async () => "failed", retry });
    await enqueueAdminDeletion("deletion_1");
    expect(retry).toHaveBeenCalledWith("failed"); expect(mocks.add).not.toHaveBeenCalled();
  });
});
