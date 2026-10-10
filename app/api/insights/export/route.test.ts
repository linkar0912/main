import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getAutomation: vi.fn(),
  listRecentParticipants: vi.fn(),
  getMemberRole: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ getMemberRole: mocks.getMemberRole, getAutomation: mocks.getAutomation, listRecentParticipants: mocks.listRecentParticipants, listRecentWebhookEvents: async () => [] }),
}));

const { GET } = await import("./route");

describe("GET /api/insights/export", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ workspaceId: "workspace_1", userId: "user_1" });
    mocks.getAutomation.mockReset().mockResolvedValue({ id: "automation_1" });
    mocks.listRecentParticipants.mockReset().mockResolvedValue([]);
    mocks.getMemberRole.mockReset().mockResolvedValue("ADMIN");
  });

  it("refuses plain members", async () => {
    mocks.getMemberRole.mockResolvedValue("MEMBER");
    const response = await GET(new Request("http://localhost/api/insights/export"));
    expect(response.status).toBe(403);
    expect(mocks.listRecentParticipants).not.toHaveBeenCalled();
  });

  it("neutralizes formulas in matched keywords", async () => {
    mocks.listRecentParticipants.mockResolvedValue([{
      id: "participant_1",
      automationId: "automation_1",
      instagramAccountId: "ig_1",
      state: "COMPLETED",
      matchedKeyword: "+cmd|' /C calc'!A0",
      createdAt: "2026-09-01T10:00:00.000Z",
    }]);
    const csv = await (await GET(new Request("http://localhost/api/insights/export"))).text();
    expect(csv).toContain(",'+cmd|' /C calc'!A0,");
  });

  it("exports only the selected automation", async () => {
    const response = await GET(new Request("http://localhost/api/insights/export?automationId=automation_1"));
    expect(response.status).toBe(200);
    expect(mocks.getAutomation).toHaveBeenCalledWith("workspace_1", "automation_1");
    expect(mocks.listRecentParticipants).toHaveBeenCalledWith("workspace_1", 5_000, "automation_1");
  });
});
