import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  getValidatedSession: vi.fn(),
  createAutomation: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ createAutomation: mocks.createAutomation }),
}));

const { POST } = await import("./route");

describe("POST /api/automations", () => {
  beforeEach(() => {
    mocks.getSessionFromRequest.mockReset().mockReturnValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.createAutomation.mockReset();
  });

  it("rejects a revoked session before creating an automation", async () => {
    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Comment reply", definition: {} }),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });
});
