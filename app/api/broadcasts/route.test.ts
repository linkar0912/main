import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  getValidatedSession: vi.fn(),
  listBroadcasts: vi.fn(),
  listBroadcastRecipients: vi.fn(),
  enqueueBroadcastSends: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
  getValidatedSession: mocks.getValidatedSession,
}));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ listBroadcasts: mocks.listBroadcasts, listBroadcastRecipients: mocks.listBroadcastRecipients }),
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
});
