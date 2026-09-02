// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/insights" }));

const { InsightsScreen } = await import("./insights-screen");

const insights = {
  funnel: {
    COMMENT_MATCHED: 12,
    OPENING_SENT: 10,
    OPTED_IN: 8,
    FOLLOW_VERIFIED: 6,
    LINK_SENT: 5,
    FAILED: 1,
  },
  timeseries: {
    days: 14,
    participantsPerDay: [
      { day: "2026-08-31", count: 4 },
      { day: "2026-09-01", count: 8 },
    ],
    sentPerDay: [
      { day: "2026-08-31", count: 3 },
      { day: "2026-09-01", count: 6 },
    ],
  },
  mediaPerformance: [
    { mediaId: "reel_launch", matched: 8, delivered: 6, clicked: 3 },
    { mediaId: "reel_guide", matched: 4, delivered: 3, clicked: 1 },
  ],
  capturedEmails: 7,
  optedOut: 2,
  usage: { participantsThisMonth: 12, monthlyLimit: null },
};

function stubFetch(insightsResponse: Response = new Response(JSON.stringify(insights))) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/workspace/bootstrap")) {
      return new Response(JSON.stringify({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }));
    }
    if (url === "/api/insights") return insightsResponse;
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("InsightsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("turns workspace insight data into a readable performance overview", async () => {
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal("fetch", stubFetch());
    render(<InsightsScreen />);

    expect(await screen.findByRole("heading", { name: "Insights" })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Replies sent" })).getByText("9")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "People reached" })).getByText("12")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Emails captured" })).getByText("7")).toBeTruthy();
    expect(screen.getByRole("img", { name: /daily replies sent and people reached/i })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Top content performance" })).toBeTruthy();
    expect(screen.getByText("reel_launch")).toBeTruthy();
    expect(screen.getByRole("link", { name: /export csv/i }).getAttribute("href")).toBe("/api/insights/export");
  });

  it("offers a retry when insights cannot be loaded", async () => {
    vi.stubGlobal("scrollTo", vi.fn());
    const fetchMock = stubFetch(new Response(JSON.stringify({ error: "Insights are unavailable" }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<InsightsScreen />);

    expect((await screen.findByRole("alert")).textContent).toContain("Insights are unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/insights")).toHaveLength(2));
  });
});
