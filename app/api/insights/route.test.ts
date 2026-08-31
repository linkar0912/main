import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getAutomation: vi.fn(),
  countParticipantsByState: vi.fn(),
  countParticipantsPerDay: vi.fn(),
  countExecutionsSentPerDay: vi.fn(),
  countParticipantsByMedia: vi.fn(),
  countParticipantsCreatedSince: vi.fn(),
  countCapturedContacts: vi.fn(),
  countSuppressedContacts: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    getAutomation: mocks.getAutomation,
    countParticipantsByState: mocks.countParticipantsByState,
    countParticipantsPerDay: mocks.countParticipantsPerDay,
    countExecutionsSentPerDay: mocks.countExecutionsSentPerDay,
    countParticipantsByMedia: mocks.countParticipantsByMedia,
    countParticipantsCreatedSince: mocks.countParticipantsCreatedSince,
    countCapturedContacts: mocks.countCapturedContacts,
    countSuppressedContacts: mocks.countSuppressedContacts,
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
    mocks.countParticipantsCreatedSince.mockReset().mockResolvedValue(0);
    mocks.countCapturedContacts.mockReset().mockResolvedValue(0);
    mocks.countSuppressedContacts.mockReset().mockResolvedValue(0);
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

  it("include=usage skips the heavy analytics queries", async () => {
    mocks.countParticipantsCreatedSince.mockResolvedValue(7);
    const response = await GET(new Request("http://localhost/api/insights?automationId=automation_1&include=usage"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.usage).toEqual({ participantsThisMonth: 7, monthlyLimit: null });
    expect(mocks.countParticipantsByState).not.toHaveBeenCalled();
    expect(mocks.countParticipantsPerDay).not.toHaveBeenCalled();
  });

  it("include=overview returns the dashboard's fields and skips the ones it never renders", async () => {
    mocks.countParticipantsPerDay.mockResolvedValue([{ day: "2026-08-31", count: 3 }]);
    mocks.countExecutionsSentPerDay.mockResolvedValue([{ day: "2026-08-31", count: 5 }]);
    mocks.countCapturedContacts.mockResolvedValue(11);
    mocks.countSuppressedContacts.mockResolvedValue(2);

    const response = await GET(new Request("http://localhost/api/insights?include=overview"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      timeseries: { days: 14, participantsPerDay: [{ day: "2026-08-31", count: 3 }], sentPerDay: [{ day: "2026-08-31", count: 5 }] },
      capturedEmails: 11,
      optedOut: 2,
    });
    // Home shows neither the funnel, per-post performance, nor plan usage, so
    // those three queries must not run for it.
    expect(mocks.countParticipantsByState).not.toHaveBeenCalled();
    expect(mocks.countParticipantsByMedia).not.toHaveBeenCalled();
    expect(mocks.countParticipantsCreatedSince).not.toHaveBeenCalled();
  });

  it("returns 404 before analytics queries for a foreign automation", async () => {
    mocks.getAutomation.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/insights?automationId=foreign"));
    expect(response.status).toBe(404);
    expect(mocks.countParticipantsByState).not.toHaveBeenCalled();
  });
});
