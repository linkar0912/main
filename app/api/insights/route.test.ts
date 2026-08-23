import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getAutomation: vi.fn(),
  countParticipantsByState: vi.fn(),
  countParticipantsPerDay: vi.fn(),
  countExecutionsSentPerDay: vi.fn(),
  countParticipantsByMedia: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    getAutomation: mocks.getAutomation,
    countParticipantsByState: mocks.countParticipantsByState,
    countParticipantsPerDay: mocks.countParticipantsPerDay,
    countExecutionsSentPerDay: mocks.countExecutionsSentPerDay,
    countParticipantsByMedia: mocks.countParticipantsByMedia,
  }),
}));

const { GET } = await import("./route");

describe("GET /api/insights", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ workspaceId: "workspace_1", userId: "user_1" });
    mocks.getAutomation.mockReset().mockResolvedValue({ id: "automation_1" });
    mocks.countParticipantsByState.mockReset().mockResolvedValue({});
    mocks.countParticipantsPerDay.mockReset().mockResolvedValue([]);
    mocks.countExecutionsSentPerDay.mockReset().mockResolvedValue([]);
    mocks.countParticipantsByMedia.mockReset().mockResolvedValue([]);
  });

  it("passes the selected automation to every analytics query", async () => {
    const response = await GET(new Request("http://localhost/api/insights?automationId=automation_1"));

    expect(response.status).toBe(200);
    expect(mocks.getAutomation).toHaveBeenCalledWith("workspace_1", "automation_1");
    expect(mocks.countParticipantsByState).toHaveBeenCalledWith("workspace_1", "automation_1");
    expect(mocks.countParticipantsPerDay).toHaveBeenCalledWith("workspace_1", 14, "automation_1");
    expect(mocks.countExecutionsSentPerDay).toHaveBeenCalledWith("workspace_1", 14, "automation_1");
    expect(mocks.countParticipantsByMedia).toHaveBeenCalledWith("workspace_1", "automation_1");
  });

  it("returns 404 before analytics queries for a foreign automation", async () => {
    mocks.getAutomation.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/insights?automationId=foreign"));
    expect(response.status).toBe(404);
    expect(mocks.countParticipantsByState).not.toHaveBeenCalled();
  });
});
