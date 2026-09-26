import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  counts: vi.fn(),
}));

vi.mock("./env", () => ({ getServerEnv: () => ({ redisUrl: "redis://queue.test:6379" }) }));
vi.mock("ioredis", () => ({ default: class Redis {} }));
vi.mock("bullmq", () => ({
  Queue: class Queue {
    constructor(readonly name: string) {}
    getJobCounts = () => state.counts(this.name);
    isPaused = async () => false;
    getJobs = async () => [];
  },
}));

const { getAdminQueueSnapshot, getWebhookQueueCounts } = await import("./queue");

describe("queue snapshots", () => {
  beforeEach(() => {
    delete (globalThis as { linkarWebhookQueue?: unknown }).linkarWebhookQueue;
    delete (globalThis as { linkarBulkQueue?: unknown }).linkarBulkQueue;
    state.counts.mockReset().mockImplementation(async (name: string) =>
      name === "linkar-webhooks"
        ? { waiting: 1, prioritized: 4, active: 2, delayed: 0, completed: 0, failed: 1 }
        : { waiting: 0, prioritized: 3, active: 1, delayed: 2, completed: 0, failed: 0 });
  });

  it("includes prioritized jobs in the reported waiting count", async () => {
    await expect(getAdminQueueSnapshot("webhooks")).resolves.toMatchObject({ waiting: 5, active: 2 });
    await expect(getAdminQueueSnapshot("bulk")).resolves.toMatchObject({ waiting: 3, active: 1 });
    await expect(getWebhookQueueCounts()).resolves.toMatchObject({ waiting: 8, active: 3, delayed: 2 });
  });
});
