import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  getValidatedSession: vi.fn(),
  listBroadcasts: vi.fn(),
  listBroadcastRecipients: vi.fn(),
  createBroadcast: vi.fn(),
  getMessagingWindow: vi.fn(),
  incrementBroadcastCounters: vi.fn(),
  finalizeBroadcastIfDone: vi.fn(),
  enqueueBroadcastSends: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
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
  }),
}));
vi.mock("@/src/lib/queue", () => ({
  enqueueBroadcastSends: mocks.enqueueBroadcastSends,
  isQueueConfigured: () => true,
}));

const { GET, POST } = await import("./route");

describe("/api/broadcasts session validation", () => {
  beforeEach(() => {
    mocks.getSessionFromRequest.mockReset().mockReturnValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.listBroadcasts.mockReset().mockResolvedValue([]);
    mocks.listBroadcastRecipients.mockReset();
    mocks.createBroadcast.mockReset();
    mocks.getMessagingWindow.mockReset().mockResolvedValue(null);
    mocks.incrementBroadcastCounters.mockReset();
    mocks.finalizeBroadcastIfDone.mockReset();
    mocks.enqueueBroadcastSends.mockReset();
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
    expect(mocks.incrementBroadcastCounters).toHaveBeenCalledWith("broadcast_1", { failed: 1 });
    expect(mocks.finalizeBroadcastIfDone).toHaveBeenCalledWith("workspace_1", "broadcast_1");
  });
});
