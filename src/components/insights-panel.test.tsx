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
      timeseries: { days: 14, participantsPerDay: [], sentPerDay: [] },
      mediaPerformance: [],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<InsightsPanel automationId="automation_1" />);

    await screen.findByLabelText("Last 14 days");
    expect(fetchMock).toHaveBeenCalledWith("/api/insights?automationId=automation_1");
    expect(screen.getByRole("link", { name: /export csv/i }).getAttribute("href"))
      .toBe("/api/insights/export?automationId=automation_1");
  });
});
