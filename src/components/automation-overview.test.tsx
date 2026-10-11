// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationRecord } from "@/src/lib/repository";
import { AutomationOverview, comparisonSentence, overviewNumbers, recentActivityRows } from "./automation-overview";
import { clearWorkspaceDataCache } from "@/src/lib/client/workspace-data";

function automation(overrides: Partial<AutomationRecord> = {}): AutomationRecord {
  return {
    id: "auto_1",
    workspaceId: "workspace_1",
    provider: "INSTAGRAM",
    name: "Price list",
    status: "ACTIVE",
    version: 3,
    priority: 0,
    definition: {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["PRICE", "rate"], mediaIds: [], replyOncePerUser: true },
      conditions: [],
      actions: [
        { type: "private_reply", text: "Sending it to your DMs" },
        { type: "send_image", imageUrl: "https://cdn.example/p.jpg", caption: "Our prices" },
      ],
      dailySendLimit: 500,
    },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  } as AutomationRecord;
}

const day = (count: number, index: number) => ({ day: `2026-10-0${index + 1}`, count });

function stubApi({ insightsStatus = 200, failures = [] as unknown[] } = {}) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("/api/insights")) {
      if (insightsStatus !== 200) return new Response(null, { status: insightsStatus });
      const days = Number(new URL(url, "http://x").searchParams.get("days"));
      return new Response(JSON.stringify({
        timeseries: { days, sentPerDay: [10, 20, 30].map(day), participantsPerDay: [5, 6, 7].map(day) },
        previous: { sent: 40 },
        automations: [{ automationId: "auto_1", sent: 60, failed: 3, skipped: 0 }],
      }));
    }
    if (url.includes("/api/meta/connection")) {
      return new Response(JSON.stringify({ data: [{ id: "c1", igUserId: "ig_1", username: "studio", status: "CONNECTED", connectedAt: "" }] }));
    }
    if (url.includes("/api/facebook/connection")) return new Response(JSON.stringify({ data: [] }));
    if (url.startsWith("/api/automations/deliveries")) return new Response(JSON.stringify({ data: failures }));
    if (url.startsWith("/api/automations/auto_1/activity")) {
      return new Response(JSON.stringify({ data: [{ id: "p1", instagramUsername: "riya", matchedKeyword: "PRICE", state: "LINK_SENT", createdAt: new Date().toISOString() }] }));
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }));
  return calls;
}

describe("AutomationOverview", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearWorkspaceDataCache();
  });

  it("tells what it does in the builder's review words", async () => {
    stubApi();
    render(<AutomationOverview automation={automation()} />);

    const story = screen.getByTestId("review-summary");
    expect(story.textContent).toContain("Someone comments “PRICE” or “rate” on any of your posts.");
    expect(story.textContent).toContain("Linkar sends them a private DM:");
    expect(story.textContent).toContain("Photo, then “Our prices”");
    expect(story.textContent).toContain("Each person gets one reply, even if they comment again.");
    expect(story.textContent).toContain("It stops for the day after 500 replies.");
    expect(await screen.findByText(/on @studio/)).toBeTruthy();
  });

  it("shows the range's numbers and switches range from the toolbar", async () => {
    const calls = stubApi();
    render(<AutomationOverview automation={automation()} />);

    const numbers = screen.getByRole("region", { name: /Last 7 days/ });
    await waitFor(() => expect(within(numbers).getByText("60")).toBeTruthy());
    expect(within(numbers).getByText("18")).toBeTruthy();
    expect(within(numbers).getByText("3")).toBeTruthy();
    expect(within(numbers).getByText("Up 50% on the previous 7 days.")).toBeTruthy();

    fireEvent.click(within(numbers).getByRole("button", { name: "30 days" }));
    await waitFor(() => expect(calls).toContain("/api/insights?automationId=auto_1&days=30"));
    expect(await screen.findByRole("heading", { name: "Last 30 days" })).toBeTruthy();
  });

  it("flags recent failures at the top and lists them", async () => {
    stubApi({ failures: [{ kind: "CLASSIC_ACTION", state: "FAILED", attemptCount: 2, automationId: "auto_1", lastError: "(#4) Application request limit reached", updatedAt: new Date().toISOString() }] });
    render(<AutomationOverview automation={automation()} />);

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("1 message couldn't be sent in the last 7 days.");
    expect(within(status).getByRole("link", { name: "Review" }).getAttribute("href")).toBe("#automation-problems");
    expect(within(screen.getByRole("region", { name: "Delivery issues" })).getByText("Tried 2 times")).toBeTruthy();
  });

  it("shows the latest people a campaign answered, linking to the full activity", async () => {
    stubApi();
    render(<AutomationOverview automation={automation({ provider: "FACEBOOK", facebookPageId: "page_1" })} />);

    expect(await screen.findByText("See all activity")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See all activity" }).getAttribute("href")).toBe("/automations/auto_1/activity");
  });

  it("offers a retry when the numbers fail to load", async () => {
    stubApi({ insightsStatus: 500 });
    render(<AutomationOverview automation={automation()} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The numbers didn’t load.");
  });
});

describe("overview maths", () => {
  it("sums the window and reads the comparison in plain words", () => {
    const numbers = overviewNumbers({
      timeseries: { days: 7, sentPerDay: [day(4, 0), day(6, 1)], participantsPerDay: [day(3, 0)] },
      previous: { sent: 20 },
      automations: [{ automationId: "a", sent: 10, failed: 1, skipped: 0 }],
    }, "a", 7);
    expect(numbers).toEqual({ days: 7, sent: 10, reached: 3, failed: 1, previousSent: 20 });
    expect(comparisonSentence(numbers)).toBe("Down 50% on the previous 7 days.");
    expect(comparisonSentence({ ...numbers, previousSent: 10 })).toBe("Level with the previous 7 days.");
    expect(comparisonSentence({ ...numbers, previousSent: 0 })).toBe("No replies in the 7 days before, so this is a fresh start.");
    expect(comparisonSentence({ ...numbers, sent: 0, previousSent: 0 })).toBeNull();
  });

  it("turns the activity feed into who / what / outcome rows, newest first", () => {
    const rows = recentActivityRows({
      data: [
        { id: "old", createdAt: "2026-10-01T00:00:00.000Z", authorName: "Rahul", commentPreview: "Price?", result: "FAILED" },
        { id: "new", createdAt: "2026-10-02T00:00:00.000Z", authorName: "Lakshmi", commentPreview: "Size 40?", result: "SENT" },
      ],
    }, true);
    expect(rows.map((row) => [row.id, row.who, row.outcome, row.tone])).toEqual([
      ["new", "Lakshmi", "Replied", "success"],
      ["old", "Rahul", "Failed", "danger"],
    ]);
  });
});
