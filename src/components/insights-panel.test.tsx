// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsightsPanel } from "./insights-panel";

describe("InsightsPanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("scopes insights and CSV export to the selected automation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      usage: { participantsThisMonth: 3, monthlyLimit: 100 },
      mediaPerformance: [],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<InsightsPanel automationId="automation_1" />);

    await screen.findByLabelText("Campaign export");
    expect(fetchMock).toHaveBeenCalledWith("/api/insights?automationId=automation_1");
    expect(screen.getByRole("link", { name: /export csv/i }).getAttribute("href"))
      .toBe("/api/insights/export?automationId=automation_1");
  });

  it("does not render the dashboard-style chart or per-post table", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      timeseries: { days: 14, participantsPerDay: [], sentPerDay: [] },
      mediaPerformance: [{ mediaId: "media_1", matched: 2, delivered: 2, clicked: 1 }],
    }), { status: 200 })));

    render(<InsightsPanel automationId="automation_1" />);

    await screen.findByLabelText("Campaign export");
    expect(screen.queryByText(/Participants & deliveries/i)).toBeNull();
    expect(screen.queryByLabelText("Last 14 days")).toBeNull();
    expect(screen.queryByLabelText("Top posts")).toBeNull();
    expect(screen.queryByText("media_1")).toBeNull();
  });
});
