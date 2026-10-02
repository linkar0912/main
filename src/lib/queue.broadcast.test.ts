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

    const ids = state.add.mock.calls.map((call) => call[2].jobId);
    expect(ids.every((id) => /^broadcast_[A-Za-z0-9_-]+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(2);
    await enqueueBroadcastSends(jobs);
    expect(state.add.mock.calls.slice(2).map((call) => call[2].jobId)).toEqual(ids);
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
  it("gives each explicit retry a new job ID while retaining stable provider delivery keys", async () => {
    await enqueueBroadcastSends([jobs[0]]);
    await enqueueBroadcastSends([jobs[0]], 0, "admin-retry-v2");
    await enqueueBroadcastSends([jobs[0]], 0, "admin-retry-v2");
    const calls = state.add.mock.calls;
    expect(calls[0][2].jobId).not.toBe(calls[1][2].jobId);
    expect(calls[1][2].jobId).toBe(calls[2][2].jobId);
    expect(calls.map((call) => call[1].deliveryKey)).toEqual([jobs[0].deliveryKey, jobs[0].deliveryKey, jobs[0].deliveryKey]);
  });

});
