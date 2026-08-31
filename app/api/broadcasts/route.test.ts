import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  listBroadcasts: vi.fn(),
  listBroadcastRecipients: vi.fn(),
  createBroadcast: vi.fn(),
  getMessagingWindow: vi.fn(),
  incrementBroadcastCounters: vi.fn(),
  finalizeBroadcastIfDone: vi.fn(),
  ensureOutboundDelivery: vi.fn(),
  claimOutboundDelivery: vi.fn(),
  failOutboundDelivery: vi.fn(),
  reconcileBroadcastCounters: vi.fn(),
  enqueueBroadcastSends: vi.fn(),
  assertEntitled: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    listBroadcasts: mocks.listBroadcasts,
    listBroadcastRecipients: mocks.listBroadcastRecipients,
    createBroadcast: mocks.createBroadcast,
    getMessagingWindow: mocks.getMessagingWindow,
    incrementBroadcastCounters: mocks.incrementBroadcastCounters,
    finalizeBroadcastIfDone: mocks.finalizeBroadcastIfDone,
    ensureOutboundDelivery: mocks.ensureOutboundDelivery,
    claimOutboundDelivery: mocks.claimOutboundDelivery,
    failOutboundDelivery: mocks.failOutboundDelivery,
    reconcileBroadcastCounters: mocks.reconcileBroadcastCounters,
  }),
}));
vi.mock("@/src/lib/queue", () => ({
  enqueueBroadcastSends: mocks.enqueueBroadcastSends,
  isQueueConfigured: () => true,
}));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));

const { GET, POST } = await import("./route");

describe("/api/broadcasts session validation", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.listBroadcasts.mockReset().mockResolvedValue([]);
    mocks.listBroadcastRecipients.mockReset();
    mocks.createBroadcast.mockReset();
    mocks.getMessagingWindow.mockReset().mockResolvedValue(null);
    mocks.incrementBroadcastCounters.mockReset();
    mocks.finalizeBroadcastIfDone.mockReset();
    mocks.ensureOutboundDelivery.mockReset().mockImplementation(async (input) => ({ ...input, id: input.deliveryKey, state: "PENDING" }));
    mocks.claimOutboundDelivery.mockReset().mockResolvedValue({ claimed: true, record: { state: "CLAIMED" } });
    mocks.failOutboundDelivery.mockReset().mockResolvedValue(true);
    mocks.reconcileBroadcastCounters.mockReset().mockResolvedValue({ total: 2, sent: 0, failed: 1, skipped: 0, pending: 1 });
    mocks.enqueueBroadcastSends.mockReset();
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
  });

  it("rejects a revoked session before listing broadcasts", async () => {
    const response = await GET(new Request("http://localhost/api/broadcasts"));
    expect(response.status).toBe(401);
    expect(mocks.listBroadcasts).not.toHaveBeenCalled();
  });

  it("rejects a revoked session before fan-out", async () => {
    const response = await POST(new Request("http://localhost/api/broadcasts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Update", text: "Hello", segment: "all_contacts" }),
    }));
    expect(response.status).toBe(401);
    expect(mocks.listBroadcastRecipients).not.toHaveBeenCalled();
    expect(mocks.enqueueBroadcastSends).not.toHaveBeenCalled();
  });

  it("counts only recipients rejected by a partially successful fan-out", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listBroadcastRecipients.mockResolvedValue([
      { instagramAccountId: "ig_a", igScopedUserId: "recipient_a" },
      { instagramAccountId: "ig_b", igScopedUserId: "recipient_b" },
    ]);
    mocks.createBroadcast.mockResolvedValue({
      id: "broadcast_1", workspaceId: "workspace_1", name: "Update", text: "Hello", segment: "all_contacts", status: "RUNNING", total: 2, sent: 0, failed: 0, skipped: 0,
    });
    mocks.enqueueBroadcastSends.mockResolvedValue({
      accepted: [{ igAccountId: "ig_a", igScopedUserId: "recipient_a" }],
      rejected: [{ igAccountId: "ig_b", igScopedUserId: "recipient_b" }],
    });

    const response = await POST(new Request("http://localhost/api/broadcasts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Update", text: "Hello", segment: "all_contacts" }),
    }));

    expect(response.status).toBe(502);
    expect(mocks.ensureOutboundDelivery).toHaveBeenCalledTimes(2);
    expect(mocks.failOutboundDelivery).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileBroadcastCounters).toHaveBeenCalledWith("workspace_1", "broadcast_1");
    expect(mocks.incrementBroadcastCounters).not.toHaveBeenCalled();
  });

  it("returns the literal broadcast-feature contract", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("entitlement_required", "broadcasts"));

    const response = await POST(new Request("http://localhost/api/broadcasts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Update", text: "Hello", segment: "all_contacts" }),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "entitlement_required", capability: "broadcasts" });
  });
});
