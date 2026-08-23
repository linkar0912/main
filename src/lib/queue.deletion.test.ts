import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  redisUrl: "redis://queue.test:6379",
  getJobs: vi.fn(),
}));

vi.mock("./env", () => ({ getServerEnv: () => ({ redisUrl: state.redisUrl }) }));
vi.mock("ioredis", () => ({ default: class Redis {} }));
vi.mock("bullmq", () => ({
  Queue: class Queue {
    getJobs = state.getJobs;
  },
}));

const { deleteQueuedInstagramEvents } = await import("./queue");

describe("Instagram queue deletion", () => {
  beforeEach(() => {
    state.getJobs.mockReset();
    delete (globalThis as { replyconnectWebhookQueue?: unknown }).replyconnectWebhookQueue;
  });

  afterEach(() => {
    delete (globalThis as { replyconnectWebhookQueue?: unknown }).replyconnectWebhookQueue;
  });

  it("removes both webhook and broadcast jobs belonging to the Instagram account", async () => {
    const webhookRemove = vi.fn().mockResolvedValue(undefined);
    const broadcastRemove = vi.fn().mockResolvedValue(undefined);
    state.getJobs
      .mockResolvedValueOnce([
        { data: { accountId: "ig_target" }, remove: webhookRemove },
        { data: { igAccountId: "ig_target" }, remove: broadcastRemove },
        { data: { igAccountId: "ig_sibling" }, remove: vi.fn() },
      ])
      .mockResolvedValueOnce([]);

    await deleteQueuedInstagramEvents("ig_target");

    expect(webhookRemove).toHaveBeenCalledOnce();
    expect(broadcastRemove).toHaveBeenCalledOnce();
  });
});
