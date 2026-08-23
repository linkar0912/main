import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  getValidatedSession: vi.fn(),
  countExecutionsByStatusPerAutomation: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
  getValidatedSession: mocks.getValidatedSession,
}));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ countExecutionsByStatusPerAutomation: mocks.countExecutionsByStatusPerAutomation }),
}));

const { GET } = await import("./route");

describe("GET /api/insights/funnels", () => {
  beforeEach(() => {
    mocks.getSessionFromRequest.mockReset().mockReturnValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.countExecutionsByStatusPerAutomation.mockReset();
  });

  it("rejects a revoked session before querying funnel data", async () => {
    const response = await GET(new Request("http://localhost/api/insights/funnels"));
    expect(response.status).toBe(401);
    expect(mocks.countExecutionsByStatusPerAutomation).not.toHaveBeenCalled();
  });
});
