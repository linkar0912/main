import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  redisUrl: "redis://queue.test:6379",
  add: vi.fn(),
}));

vi.mock("./env", () => ({
  getServerEnv: () => ({ redisUrl: state.redisUrl }),
}));
vi.mock("ioredis", () => ({ default: class Redis {} }));
vi.mock("bullmq", () => ({
  Queue: class Queue {
    add = state.add;
  },
}));

const { enqueueBroadcastSends } = await import("./queue");

const jobs = [
  {
    deliveryKey: "broadcast:broadcast_1:ig_account_a:recipient_1",
    broadcastId: "broadcast_1",
    workspaceId: "workspace_1",
    igAccountId: "ig_account_a",
    igScopedUserId: "recipient_1",
  },
  {
    deliveryKey: "broadcast:broadcast_1:ig_account_b:recipient_1",
    broadcastId: "broadcast_1",
    workspaceId: "workspace_1",
    igAccountId: "ig_account_b",
    igScopedUserId: "recipient_1",
  },
];

describe("broadcast queue fan-out", () => {
  beforeEach(() => {
    state.add.mockReset().mockResolvedValue({ id: "job" });
    delete (globalThis as { linkarWebhookQueue?: unknown }).linkarWebhookQueue;
    delete (globalThis as { linkarBulkQueue?: unknown }).linkarBulkQueue;
  });

  afterEach(() => {
    delete (globalThis as { linkarWebhookQueue?: unknown }).linkarWebhookQueue;
    delete (globalThis as { linkarBulkQueue?: unknown }).linkarBulkQueue;
  });

  it("includes the Instagram account in otherwise identical recipient job IDs", async () => {
    await enqueueBroadcastSends(jobs);

    expect(state.add.mock.calls.map((call) => call[2].jobId)).toEqual([
      "broadcast:broadcast_1:ig_account_a:recipient_1",
      "broadcast:broadcast_1:ig_account_b:recipient_1",
    ]);
  });

  it("returns exact accepted and rejected recipients after a partial queue failure", async () => {
    state.add.mockResolvedValueOnce({ id: "job_a" }).mockRejectedValueOnce(new Error("queue unavailable"));

    await expect(enqueueBroadcastSends(jobs)).resolves.toEqual({
      accepted: [{ igAccountId: "ig_account_a", igScopedUserId: "recipient_1" }],
      rejected: [{ igAccountId: "ig_account_b", igScopedUserId: "recipient_1" }],
    });
  });

  it("keeps one-second spacing beyond 600 recipients", async () => {
    await enqueueBroadcastSends(Array.from({ length: 602 }, (_, index) => ({
      ...jobs[0],
      deliveryKey: `delivery_${index}`,
      igScopedUserId: `recipient_${index}`,
    })));

    expect(state.add.mock.calls[600][2].delay).toBe(600_000);
    expect(state.add.mock.calls[601][2].delay).toBe(601_000);
  });
});
