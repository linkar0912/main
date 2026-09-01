import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  getJob: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add = mocks.add;
    getJob = mocks.getJob;
  },
}));

vi.mock("ioredis", () => ({ default: class Redis {} }));

process.env.REDIS_URL = "redis://queue-priority.test";

const {
  enqueueAdminDeletion,
  enqueueAdminMaintenance,
  enqueueBroadcastSends,
  enqueueFlowFollowUps,
  enqueueLeadDelivery,
  QUEUE_PRIORITY,
} = await import("./queue");

describe("queue priority tiers", () => {
  beforeEach(() => {
    mocks.add.mockReset().mockResolvedValue(undefined);
    mocks.getJob.mockReset().mockResolvedValue(null);
  });

  it("keeps interactive follow-ups ahead of bulk delivery", async () => {
    await enqueueFlowFollowUps([{
      deliveryKey: "followup_1",
      workspaceId: "workspace_1",
      automationId: "automation_1",
      instagramAccountId: "ig_1",
      recipientId: "person_1",
      delayMinutes: 5,
      message: { type: "text", text: "Still interested?" },
    }]);
    expect(mocks.add).toHaveBeenLastCalledWith(
      "flow-followup",
      expect.any(Object),
      expect.objectContaining({ priority: QUEUE_PRIORITY.INTERACTIVE }),
    );

    await enqueueLeadDelivery({
      deliveryKey: "lead_1",
      workspaceId: "workspace_1",
      kind: "LEAD_WEBHOOK",
    });
    expect(mocks.add).toHaveBeenLastCalledWith(
      "lead-delivery",
      expect.any(Object),
      expect.objectContaining({ priority: QUEUE_PRIORITY.BULK }),
    );

    await enqueueBroadcastSends([{
      deliveryKey: "broadcast_1",
      broadcastId: "broadcast_1",
      workspaceId: "workspace_1",
      igAccountId: "ig_1",
      igScopedUserId: "person_1",
    }]);
    expect(mocks.add).toHaveBeenLastCalledWith(
      "broadcast-send",
      expect.any(Object),
      expect.objectContaining({ priority: QUEUE_PRIORITY.BULK }),
    );
  });

  it("keeps maintenance and deletion work in the lowest tier", async () => {
    await enqueueAdminMaintenance("delivery_reconciliation");
    expect(mocks.add).toHaveBeenLastCalledWith(
      "admin-maintenance",
      expect.any(Object),
      expect.objectContaining({ priority: QUEUE_PRIORITY.MAINTENANCE }),
    );

    await enqueueAdminDeletion("deletion_1");
    expect(mocks.add).toHaveBeenLastCalledWith(
      "admin-deletion",
      expect.any(Object),
      expect.objectContaining({ priority: QUEUE_PRIORITY.MAINTENANCE }),
    );
  });
});
