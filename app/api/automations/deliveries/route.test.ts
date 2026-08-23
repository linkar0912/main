import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  listOutboundDeliveryProblems: vi.fn(),
}));
vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({
  listOutboundDeliveryProblems: mocks.listOutboundDeliveryProblems,
}) }));

const { GET } = await import("./route");

describe("GET /api/automations/deliveries", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.listOutboundDeliveryProblems.mockReset().mockResolvedValue([]);
  });

  it("rejects a revoked session", async () => {
    expect((await GET(new Request("http://localhost/api/automations/deliveries"))).status).toBe(401);
  });

  it("returns only sanitized problems from the session workspace", async () => {
    mocks.getValidatedSession.mockResolvedValue({ workspaceId: "workspace_a", userId: "user_1" });
    mocks.listOutboundDeliveryProblems.mockResolvedValue([{
      deliveryKey: "broadcast:b:ig:person-secret",
      workspaceId: "workspace_a",
      recipientId: "person-secret",
      payload: { token: "never-return" },
      kind: "BROADCAST_RECIPIENT",
      state: "UNKNOWN",
      attemptCount: 2,
      broadcastId: "broadcast_1",
      lastError: "socket closed",
      updatedAt: "2026-08-23T12:00:00.000Z",
    }]);
    const response = await GET(new Request("http://localhost/api/automations/deliveries?limit=500"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.listOutboundDeliveryProblems).toHaveBeenCalledWith("workspace_a", 100);
    expect(body.data[0]).toEqual({
      kind: "BROADCAST_RECIPIENT",
      state: "UNKNOWN",
      attemptCount: 2,
      broadcastId: "broadcast_1",
      lastError: "socket closed",
      updatedAt: "2026-08-23T12:00:00.000Z",
    });
    expect(JSON.stringify(body)).not.toContain("person-secret");
    expect(JSON.stringify(body)).not.toContain("never-return");
  });
});
