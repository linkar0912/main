import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getAutomation: vi.fn(),
  listRecentParticipants: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ getAutomation: mocks.getAutomation, listRecentParticipants: mocks.listRecentParticipants }),
}));

const { GET } = await import("./route");

describe("GET /api/insights/export", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ workspaceId: "workspace_1", userId: "user_1" });
    mocks.getAutomation.mockReset().mockResolvedValue({ id: "automation_1" });
    mocks.listRecentParticipants.mockReset().mockResolvedValue([]);
  });

  it("exports only the selected automation", async () => {
    const response = await GET(new Request("http://localhost/api/insights/export?automationId=automation_1"));
    expect(response.status).toBe(200);
    expect(mocks.getAutomation).toHaveBeenCalledWith("workspace_1", "automation_1");
    expect(mocks.listRecentParticipants).toHaveBeenCalledWith("workspace_1", 5_000, "automation_1");
  });
});
