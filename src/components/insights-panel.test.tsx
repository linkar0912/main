// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsightsPanel } from "./insights-panel";

describe("InsightsPanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("scopes both insights and CSV export to the selected automation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      usage: { participantsThisMonth: 3, monthlyLimit: 100 },
      mediaPerformance: [],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<InsightsPanel automationId="automation_1" />);

    await screen.findByLabelText("Top posts");
    expect(fetchMock).toHaveBeenCalledWith("/api/insights?automationId=automation_1");
    expect(screen.getByRole("link", { name: /export csv/i }).getAttribute("href"))
      .toBe("/api/insights/export?automationId=automation_1");
  });

  it("does not render the dashboard-style participants chart", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      timeseries: { days: 14, participantsPerDay: [], sentPerDay: [] },
      mediaPerformance: [],
    }), { status: 200 })));

    render(<InsightsPanel automationId="automation_1" />);

    await screen.findByLabelText("Top posts");
    expect(screen.queryByText(/Participants & deliveries/i)).toBeNull();
    expect(screen.queryByLabelText("Last 14 days")).toBeNull();
  });
});
