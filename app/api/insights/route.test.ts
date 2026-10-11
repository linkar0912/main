import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getAutomation: vi.fn(),
  countParticipantsByState: vi.fn(),
  countParticipantsPerDay: vi.fn(),
  countExecutionsSentPerDay: vi.fn(),
  countParticipantsByMedia: vi.fn(),
  countParticipantFunnel: vi.fn(),
  countExecutionsByStatusPerAutomation: vi.fn(),
  countParticipantsCreatedSince: vi.fn(),
  countCapturedContacts: vi.fn(),
  countSuppressedContacts: vi.fn(),
  getWorkspaceUsage: vi.fn(),
  getMonthlyDeliveryLimit: vi.fn(),
}));

vi.mock("@/src/lib/entitlements/service", () => ({
  getEntitlementService: () => ({ getMonthlyDeliveryLimit: mocks.getMonthlyDeliveryLimit }),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    getAutomation: mocks.getAutomation,
    countParticipantsByState: mocks.countParticipantsByState,
    countParticipantsPerDay: mocks.countParticipantsPerDay,
    countExecutionsSentPerDay: mocks.countExecutionsSentPerDay,
    countParticipantsByMedia: mocks.countParticipantsByMedia,
    countParticipantFunnel: mocks.countParticipantFunnel,
    countExecutionsByStatusPerAutomation: mocks.countExecutionsByStatusPerAutomation,
    countParticipantsCreatedSince: mocks.countParticipantsCreatedSince,
    countCapturedContacts: mocks.countCapturedContacts,
    countSuppressedContacts: mocks.countSuppressedContacts,
    getWorkspaceUsage: mocks.getWorkspaceUsage,
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
    mocks.countParticipantFunnel.mockReset().mockResolvedValue({ commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 });
    mocks.countExecutionsByStatusPerAutomation.mockReset().mockResolvedValue([]);
    mocks.countParticipantsCreatedSince.mockReset().mockResolvedValue(0);
    mocks.countCapturedContacts.mockReset().mockResolvedValue(0);
    mocks.countSuppressedContacts.mockReset().mockResolvedValue(0);
    mocks.getWorkspaceUsage.mockReset().mockResolvedValue({ deliveriesReserved: 0, broadcastsCreated: 0 });
    mocks.getMonthlyDeliveryLimit.mockReset().mockResolvedValue(null);
  });

  it("passes the selected automation to every analytics query", async () => {
    const response = await GET(new Request("http://localhost/api/insights?automationId=automation_1"));

    expect(response.status).toBe(200);
    expect(mocks.getAutomation).toHaveBeenCalledWith("workspace_1", "automation_1");
    expect(mocks.countParticipantsByState).toHaveBeenCalledWith("workspace_1", "automation_1");
    // Twice the 14-day window: the older half is the comparison period.
    expect(mocks.countParticipantsPerDay).toHaveBeenCalledWith("workspace_1", 28, "automation_1");
    expect(mocks.countExecutionsSentPerDay).toHaveBeenCalledWith("workspace_1", 28, "automation_1");
    expect(mocks.countParticipantsByMedia).toHaveBeenCalledWith("workspace_1", "automation_1");
    expect(mocks.countParticipantFunnel).toHaveBeenCalledWith("workspace_1", "automation_1");
  });

  it("splits the doubled series into this window and the previous window's totals", async () => {
    const series = (counts: number[]) => counts.map((count, index) => ({ day: `2026-09-${String(index + 1).padStart(2, "0")}`, count }));
    mocks.countExecutionsSentPerDay.mockResolvedValue(series([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]));
    mocks.countParticipantsPerDay.mockResolvedValue(series([0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1]));

    const response = await GET(new Request("http://localhost/api/insights?days=7"));
    const body = await response.json();

    expect(mocks.countExecutionsSentPerDay).toHaveBeenCalledWith("workspace_1", 14, undefined);
    expect(body.timeseries.days).toBe(7);
    expect(body.timeseries.sentPerDay).toHaveLength(7);
    expect(body.timeseries.sentPerDay[0]).toEqual({ day: "2026-09-08", count: 2 });
    expect(body.previous).toEqual({ sent: 7, reached: 0 });
  });

  it("ignores a window the range control doesn't offer", async () => {
    await GET(new Request("http://localhost/api/insights?days=365"));
    expect(mocks.countParticipantsPerDay).toHaveBeenCalledWith("workspace_1", 28, undefined);
  });

  it("reports send outcomes per automation from the start of the window, narrowed by the filter", async () => {
    mocks.countExecutionsByStatusPerAutomation.mockResolvedValue([
      { automationId: "automation_1", sent: 9, failed: 1, skipped: 0 },
      { automationId: "automation_2", sent: 4, failed: 0, skipped: 2 },
    ]);

    const all = await (await GET(new Request("http://localhost/api/insights?days=30"))).json();
    expect(all.automations).toHaveLength(2);
    const [, since] = mocks.countExecutionsByStatusPerAutomation.mock.calls[0];
    const expectedSince = new Date();
    expectedSince.setUTCHours(0, 0, 0, 0);
    expectedSince.setUTCDate(expectedSince.getUTCDate() - 29);
    expect(since).toBe(expectedSince.toISOString());

    const one = await (await GET(new Request("http://localhost/api/insights?automationId=automation_1"))).json();
    expect(one.automations).toEqual([{ automationId: "automation_1", sent: 9, failed: 1, skipped: 0 }]);
  });

  it("returns the workspace-wide cumulative journey when no automation is selected", async () => {
    mocks.countParticipantFunnel.mockResolvedValue({ commented: 10, openingSent: 8, optedIn: 5, followed: 4, linkSent: 4 });
    const body = await (await GET(new Request("http://localhost/api/insights"))).json();
    expect(mocks.countParticipantFunnel).toHaveBeenCalledWith("workspace_1", undefined);
    expect(body.journey).toEqual({ commented: 10, openingSent: 8, optedIn: 5, followed: 4, linkSent: 4 });
  });

  it("include=usage reports this month's deliveries against the plan's delivery limit", async () => {
    mocks.getWorkspaceUsage.mockResolvedValue({ deliveriesReserved: 7, broadcastsCreated: 1 });
    mocks.getMonthlyDeliveryLimit.mockResolvedValue(1_000);
    const response = await GET(new Request("http://localhost/api/insights?automationId=automation_1&include=usage"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.usage).toEqual({ deliveriesThisMonth: 7, monthlyDeliveryLimit: 1_000 });
    expect(mocks.getWorkspaceUsage).toHaveBeenCalledWith("workspace_1", expect.stringMatching(/^\d{4}-\d{2}-01$/));
    expect(mocks.getMonthlyDeliveryLimit).toHaveBeenCalledWith("workspace_1");
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
      previous: { sent: 0, reached: 0 },
      capturedEmails: 11,
      optedOut: 2,
      contactTotalsScope: "workspace",
    });
    // Home shows neither the funnel, per-post performance, nor plan usage, so
    // those three queries must not run for it.
    expect(mocks.countParticipantsByState).not.toHaveBeenCalled();
    expect(mocks.countParticipantsByMedia).not.toHaveBeenCalled();
    expect(mocks.countParticipantsCreatedSince).not.toHaveBeenCalled();
    expect(mocks.countParticipantFunnel).not.toHaveBeenCalled();
    expect(mocks.countExecutionsByStatusPerAutomation).not.toHaveBeenCalled();
  });

  it("returns 404 before analytics queries for a foreign automation", async () => {
    mocks.getAutomation.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/insights?automationId=foreign"));
    expect(response.status).toBe(404);
    expect(mocks.countParticipantsByState).not.toHaveBeenCalled();
  });
});
