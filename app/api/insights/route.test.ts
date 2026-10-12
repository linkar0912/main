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
  countEmailCaptureFunnel: vi.fn(),
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
    countEmailCaptureFunnel: mocks.countEmailCaptureFunnel,
    countSuppressedContacts: mocks.countSuppressedContacts,
    getWorkspaceUsage: mocks.getWorkspaceUsage,
  }),
}));

const { GET } = await import("./route");

describe("GET /api/insights", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ workspaceId: "workspace_1", userId: "user_1" });
    mocks.getAutomation.mockReset().mockResolvedValue({ id: "automation_1", definition: { version: 2, trigger: { type: "comment" } } });
    mocks.countParticipantsByState.mockReset().mockResolvedValue({});
    mocks.countParticipantsPerDay.mockReset().mockResolvedValue([]);
    mocks.countExecutionsSentPerDay.mockReset().mockResolvedValue([]);
    mocks.countParticipantsByMedia.mockReset().mockResolvedValue([]);
    mocks.countParticipantFunnel.mockReset().mockResolvedValue({ commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 });
    mocks.countExecutionsByStatusPerAutomation.mockReset().mockResolvedValue([]);
    mocks.countParticipantsCreatedSince.mockReset().mockResolvedValue(0);
    mocks.countCapturedContacts.mockReset().mockResolvedValue(0);
    mocks.countEmailCaptureFunnel.mockReset().mockResolvedValue({ messaged: 0, asked: 0, captured: 0 });
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

  it.each([7, 30])("include=overview follows a %i-day window for Home's range switch", async (days) => {
    const series = Array.from({ length: days * 2 }, (_, index) => ({ day: `d${String(index).padStart(2, "0")}`, count: index < days ? 1 : 2 }));
    mocks.countExecutionsSentPerDay.mockResolvedValue(series);
    mocks.countParticipantsPerDay.mockResolvedValue(series);

    const body = await (await GET(new Request(`http://localhost/api/insights?include=overview&days=${days}`))).json();

    expect(mocks.countExecutionsSentPerDay).toHaveBeenCalledWith("workspace_1", days * 2, undefined);
    expect(mocks.countParticipantsPerDay).toHaveBeenCalledWith("workspace_1", days * 2, undefined);
    expect(body.timeseries.days).toBe(days);
    expect(body.timeseries.sentPerDay).toHaveLength(days);
    expect(body.previous).toEqual({ sent: days, reached: days });
  });

  it("include=overview falls back to 14 days for a window Home doesn't offer", async () => {
    const body = await (await GET(new Request("http://localhost/api/insights?include=overview&days=90"))).json();
    expect(mocks.countExecutionsSentPerDay).toHaveBeenCalledWith("workspace_1", 28, undefined);
    expect(body.timeseries.days).toBe(14);
  });

  describe("include=automation", () => {
    function sinceFor(days: number): string {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - (days - 1));
      return since.toISOString();
    }

    it("needs an automation", async () => {
      const response = await GET(new Request("http://localhost/api/insights?include=automation&days=7"));
      expect(response.status).toBe(400);
      expect(mocks.countParticipantFunnel).not.toHaveBeenCalled();
    });

    it("404s a foreign automation before any analytics query", async () => {
      mocks.getAutomation.mockResolvedValue(null);
      const response = await GET(new Request("http://localhost/api/insights?include=automation&automationId=foreign&days=7"));
      expect(response.status).toBe(404);
      expect(mocks.getAutomation).toHaveBeenCalledWith("workspace_1", "foreign");
      expect(mocks.countParticipantFunnel).not.toHaveBeenCalled();
      expect(mocks.countExecutionsByStatusPerAutomation).not.toHaveBeenCalled();
    });

    it("windows every measure and derives the previous window from twice the window", async () => {
      const series = (counts: number[]) => counts.map((count, index) => ({ day: `2026-09-${String(index + 1).padStart(2, "0")}`, count }));
      mocks.countExecutionsSentPerDay.mockResolvedValue(series([1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3]));
      mocks.countParticipantsPerDay.mockResolvedValue(series([0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2]));
      mocks.countExecutionsByStatusPerAutomation.mockImplementation(async (_workspace: string, since: string) => since === sinceFor(7)
        ? [{ automationId: "automation_1", sent: 21, failed: 2, skipped: 1 }, { automationId: "other", sent: 99, failed: 9, skipped: 0 }]
        : [{ automationId: "automation_1", sent: 28, failed: 5, skipped: 1 }]);
      mocks.countParticipantFunnel.mockImplementation(async (_workspace: string, _automation: string, since: string) => since === sinceFor(7)
        ? { commented: 10, openingSent: 9, optedIn: 6, followed: 5, linkSent: 5 }
        : { commented: 16, openingSent: 14, optedIn: 9, followed: 7, linkSent: 7 });
      mocks.countParticipantsByMedia.mockImplementation(async (_workspace: string, _automation: string, since: string) => since === sinceFor(7)
        ? [{ mediaId: "small", matched: 2, delivered: 1, clicked: 1 }, { mediaId: "big", matched: 8, delivered: 4, clicked: 3 }]
        : [{ mediaId: "big", matched: 13, delivered: 6, clicked: 6 }]);

      const response = await GET(new Request("http://localhost/api/insights?include=automation&automationId=automation_1&days=7"));
      expect(response.status).toBe(200);
      const body = await response.json();

      expect(mocks.countParticipantFunnel).toHaveBeenCalledWith("workspace_1", "automation_1", sinceFor(7));
      expect(mocks.countParticipantFunnel).toHaveBeenCalledWith("workspace_1", "automation_1", sinceFor(14));
      expect(mocks.countParticipantsByMedia).toHaveBeenCalledWith("workspace_1", "automation_1", sinceFor(7));
      expect(mocks.countExecutionsSentPerDay).toHaveBeenCalledWith("workspace_1", 14, "automation_1");
      expect(body.timeseries.days).toBe(7);
      expect(body.timeseries.sentPerDay).toHaveLength(7);
      expect(body.outcome).toEqual({ sent: 21, failed: 2, skipped: 1 });
      expect(body.journey).toEqual({ commented: 10, openingSent: 9, optedIn: 6, followed: 5, linkSent: 5 });
      expect(body.clicks).toBe(4);
      expect(body.mediaPerformance.map((row: { mediaId: string }) => row.mediaId)).toEqual(["big", "small"]);
      expect(body.previous).toEqual({
        sent: 7,
        reached: 0,
        failed: 3,
        clicks: 2,
        captured: 0,
        journey: { commented: 6, openingSent: 5, optedIn: 3, followed: 2, linkSent: 2 },
      });
      // A campaign never asks for an email, so the capture queries are skipped.
      expect(body.capture).toBeNull();
      expect(mocks.countEmailCaptureFunnel).not.toHaveBeenCalled();
      // Workspace-wide contact totals and plan usage are not this view's business.
      expect(body.capturedEmails).toBeUndefined();
      expect(mocks.countCapturedContacts).not.toHaveBeenCalled();
      expect(mocks.getWorkspaceUsage).not.toHaveBeenCalled();
    });

    it("reads zero outcomes for an automation that sent nothing", async () => {
      const body = await (await GET(new Request("http://localhost/api/insights?include=automation&automationId=automation_1&days=30"))).json();
      expect(body.timeseries.days).toBe(30);
      expect(body.outcome).toEqual({ sent: 0, failed: 0, skipped: 0 });
      expect(body.previous.failed).toBe(0);
      expect(mocks.countParticipantFunnel).toHaveBeenCalledWith("workspace_1", "automation_1", sinceFor(30));
    });

    it("counts an email-capture automation's people messaged, asked and captured in the window", async () => {
      mocks.getAutomation.mockResolvedValue({
        id: "automation_1",
        definition: { version: 1, trigger: { type: "keyword" }, emailCapture: { promptText: "Email?", confirmationText: "Thanks" } },
      });
      mocks.countEmailCaptureFunnel.mockImplementation(async (_workspace: string, _automation: string, since: string) => since === sinceFor(14)
        ? { messaged: 40, asked: 30, captured: 12 }
        : { messaged: 70, asked: 52, captured: 20 });

      const body = await (await GET(new Request("http://localhost/api/insights?include=automation&automationId=automation_1&days=14"))).json();

      expect(mocks.countEmailCaptureFunnel).toHaveBeenCalledWith("workspace_1", "automation_1", sinceFor(14));
      expect(mocks.countEmailCaptureFunnel).toHaveBeenCalledWith("workspace_1", "automation_1", sinceFor(28));
      expect(body.capture).toEqual({ messaged: 40, asked: 30, captured: 12 });
      expect(body.previous.captured).toBe(8);
    });

    it("skips the capture queries for a comment-triggered classic automation", async () => {
      mocks.getAutomation.mockResolvedValue({
        id: "automation_1",
        definition: { version: 1, trigger: { type: "comment" }, emailCapture: { promptText: "Email?", confirmationText: "Thanks" } },
      });
      const body = await (await GET(new Request("http://localhost/api/insights?include=automation&automationId=automation_1&days=7"))).json();
      expect(body.capture).toBeNull();
      expect(mocks.countEmailCaptureFunnel).not.toHaveBeenCalled();
    });
  });

  it("returns 404 before analytics queries for a foreign automation", async () => {
    mocks.getAutomation.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/insights?automationId=foreign"));
    expect(response.status).toBe(404);
    expect(mocks.countParticipantsByState).not.toHaveBeenCalled();
  });
});
