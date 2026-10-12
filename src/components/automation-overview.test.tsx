// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationRecord } from "@/src/lib/repository";
import { AUTOMATION_RANGE_KEY, AutomationOverview, recentActivityRows } from "./automation-overview";
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

function campaign(followRequired = true): AutomationRecord {
  return automation({
    id: "auto_1",
    definition: {
      version: 2,
      trigger: { type: "comment", source: "specific_media", mediaIds: ["reel_1"], mediaSnapshots: [{ id: "reel_1", caption: "Diwali drop", mediaType: "VIDEO", mediaProductType: "REELS", permalink: "https://instagram.com/reel/1", timestamp: "2026-10-01T00:00:00.000Z" }], match: "keyword", keywords: ["DIWALI"] },
      publicReplies: ["Check your DMs"],
      openingMessage: { text: "Tap below", optInButtonLabel: "Send me the link" },
      followGate: { required: followRequired, notFollowingMessage: "Follow first", recheckButtonLabel: "I followed" },
      delivery: { text: "Here it is", url: "https://example.com/diwali" },
    },
  } as Partial<AutomationRecord>);
}

const day = (count: number, index: number) => ({ day: `2026-10-0${index + 1}`, count });
const zeroJourney = { commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 };

type Analytics = Record<string, unknown>;

function analytics(days: number, overrides: Analytics = {}): Analytics {
  return {
    timeseries: { days, sentPerDay: [10, 20, 30].map(day), participantsPerDay: [5, 6, 7].map(day) },
    outcome: { sent: 60, failed: 3, skipped: 0 },
    journey: zeroJourney,
    clicks: 0,
    mediaPerformance: [],
    previous: { sent: 40, reached: 18, failed: 0, clicks: 0, journey: zeroJourney },
    ...overrides,
  };
}

function stubApi({ insightsStatus = 200, failures = [] as unknown[], payload = analytics as (days: number) => Analytics } = {}) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("/api/insights")) {
      if (insightsStatus !== 200) return new Response(null, { status: insightsStatus });
      const days = Number(new URL(url, "http://x").searchParams.get("days"));
      return new Response(JSON.stringify(payload(days)));
    }
    if (url.includes("/api/meta/media")) return new Response(JSON.stringify({ data: [] }));
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
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("tells how it works in the builder's review words, with a way to change it", async () => {
    stubApi();
    render(<AutomationOverview automation={automation()} />);

    const setup = screen.getByRole("region", { name: "How it works" });
    const story = within(setup).getByTestId("review-summary");
    expect(story.textContent).toContain("Someone comments “PRICE” or “rate” on any of your posts.");
    expect(story.textContent).toContain("Linkar sends them a private DM:");
    expect(story.textContent).toContain("Photo, then “Our prices”");
    expect(story.textContent).toContain("Each person gets one reply, even if they comment again.");
    expect(story.textContent).toContain("It stops for the day after 500 replies.");
    expect(within(setup).getByRole("link", { name: "Change it" }).getAttribute("href")).toBe("/automations/auto_1/edit");
    expect(await screen.findByText(/on @studio/)).toBeTruthy();
  });

  it("shows the window's key numbers in Home's words and switches window from the range control", async () => {
    const calls = stubApi();
    render(<AutomationOverview automation={automation()} />);

    const numbers = screen.getByRole("region", { name: "Last 14 days" });
    const figures = await within(numbers).findByRole("list", { name: "Key numbers" });
    await waitFor(() => expect(within(figures).getByText("60")).toBeTruthy());
    expect(within(figures).getByText("18")).toBeTruthy();
    expect(figures.textContent).toContain("Up 50% on the previous 14 days");
    // Failed deliveries show as a quiet warning with a way to fix them.
    const failed = within(figures).getByText("Failed deliveries").closest("[role=listitem]") as HTMLElement;
    expect(within(failed).getByText("3")).toBeTruthy();
    expect(within(failed).getByRole("link", { name: "Fix" }).getAttribute("href")).toBe("#automation-problems");
    expect(within(numbers).getByRole("img", { name: "Daily replies sent and people reached for the last 14 days" })).toBeTruthy();
    expect(calls).toContain("/api/insights?include=automation&automationId=auto_1&days=14");
    // A classic rule has no link to click, so there is no conversion figure.
    expect(within(figures).queryByText("Link clicks")).toBeNull();

    fireEvent.click(within(numbers).getByRole("button", { name: "30 days" }));
    expect(await screen.findByRole("heading", { name: "Last 30 days" })).toBeTruthy();
    await waitFor(() => expect(calls).toContain("/api/insights?include=automation&automationId=auto_1&days=30"));
    await waitFor(() => expect(screen.getByRole("list", { name: "Key numbers" }).textContent).toContain("on the previous 30 days"));
    expect(window.localStorage.getItem(AUTOMATION_RANGE_KEY)).toBe("30");
    expect(window.location.search).toBe("?range=30");
  });

  it("opens on the window this browser chose last time", async () => {
    window.localStorage.setItem(AUTOMATION_RANGE_KEY, "7");
    const calls = stubApi();
    render(<AutomationOverview automation={automation()} />);

    expect(await screen.findByRole("heading", { name: "Last 7 days" })).toBeTruthy();
    await waitFor(() => expect(calls).toContain("/api/insights?include=automation&automationId=auto_1&days=7"));
    expect(calls.filter((url) => url.startsWith("/api/insights"))).toEqual(["/api/insights?include=automation&automationId=auto_1&days=7"]);
  });

  it("hides failed deliveries when there are none", async () => {
    stubApi({ payload: (days) => analytics(days, { outcome: { sent: 60, failed: 0, skipped: 0 } }) });
    render(<AutomationOverview automation={automation()} />);
    const figures = await screen.findByRole("list", { name: "Key numbers" });
    await waitFor(() => expect(within(figures).getByText("60")).toBeTruthy());
    expect(within(figures).queryByText("Failed deliveries")).toBeNull();
  });

  it("adds link clicks, the funnel and top posts for a comment-to-link campaign", async () => {
    stubApi({
      payload: (days) => analytics(days, {
        journey: { commented: 100, openingSent: 95, optedIn: 60, followed: 30, linkSent: 29 },
        clicks: 12,
        mediaPerformance: [{ mediaId: "reel_1", matched: 100, delivered: 29, clicked: 12 }],
        previous: { sent: 40, reached: 18, failed: 0, clicks: 6, journey: zeroJourney },
      }),
    });
    render(<AutomationOverview automation={campaign()} />);

    const figures = await screen.findByRole("list", { name: "Key numbers" });
    await waitFor(() => expect(within(figures).getByText("Link clicks")).toBeTruthy());
    expect(figures.textContent).toContain("Up 100% on the previous 14 days");

    const funnel = await screen.findByRole("list", { name: "Steps from comment to link" });
    const steps = within(funnel).getAllByRole("listitem").map((step) => step.querySelector(".auto-funnel-label")?.textContent);
    expect(steps).toEqual(["Commented", "Got the DM", "Tapped the button", "Followed", "Got the link", "Opened the link"]);
    expect(funnel.textContent).toContain("95% kept");
    expect(screen.getByText(/The biggest drop is before “Opened the link”/)).toBeTruthy();

    const posts = screen.getByRole("region", { name: "Top posts" });
    expect(within(posts).getByText("Diwali drop")).toBeTruthy();
    expect(posts.textContent).toContain("100 comments matched, 29 links sent, 12 clicks");
  });

  it("shows emails collected and the message-to-email funnel for an email-capture automation", async () => {
    const capture = automation({
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["guide"] },
        conditions: [],
        actions: [{ type: "send_text", text: "Here comes the guide" }],
        emailCapture: { promptText: "What is your email?", confirmationText: "You are in" },
      },
    } as Partial<AutomationRecord>);
    const calls = stubApi({
      payload: (days) => analytics(days, {
        capture: { messaged: 50, asked: 40, captured: 12 },
        previous: { sent: 40, reached: 18, failed: 0, clicks: 0, captured: 6, journey: zeroJourney },
      }),
    });
    render(<AutomationOverview automation={capture} />);

    const figures = await screen.findByRole("list", { name: "Key numbers" });
    await waitFor(() => expect(within(figures).getByText("Emails collected")).toBeTruthy());
    const collected = within(figures).getByText("Emails collected").closest("[role=listitem]") as HTMLElement;
    await waitFor(() => expect(within(collected).getByText("12")).toBeTruthy());
    expect(collected.textContent).toContain("24% of people messaged");
    expect(collected.textContent).toContain("Up 100% on the previous 14 days");
    expect(within(figures).queryByText("Link clicks")).toBeNull();

    const funnel = await screen.findByRole("list", { name: "Steps from message to email" });
    const steps = within(funnel).getAllByRole("listitem").map((step) => step.querySelector(".auto-funnel-label")?.textContent);
    expect(steps).toEqual(["Messaged", "Asked for email", "Gave email"]);
    expect(funnel.textContent).toContain("80% kept");
    expect(funnel.textContent).toContain("30% kept");
    expect(screen.getByRole("region", { name: "From message to email" }).textContent).toContain("in the last 14 days");
    // Not a campaign: no comment-to-link funnel or top posts.
    expect(screen.queryByRole("region", { name: "Top posts" })).toBeNull();

    // The 7 / 14 / 30 switch re-asks for the same numbers in the new window.
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(calls).toContain("/api/insights?include=automation&automationId=auto_1&days=7"));
    expect(await screen.findByText(/in the last 7 days, how many it asked/)).toBeTruthy();
  });

  it("leaves out the follow step when the campaign doesn't ask people to follow", async () => {
    stubApi({ payload: (days) => analytics(days, { journey: { commented: 10, openingSent: 9, optedIn: 8, followed: 0, linkSent: 8 }, clicks: 2 }) });
    render(<AutomationOverview automation={campaign(false)} />);
    const funnel = await screen.findByRole("list", { name: "Steps from comment to link" });
    expect(within(funnel).queryByText("Followed")).toBeNull();
  });

  it("explains what will appear for a new automation instead of showing zeros", async () => {
    stubApi({
      payload: (days) => analytics(days, {
        timeseries: { days, sentPerDay: [], participantsPerDay: [] },
        outcome: { sent: 0, failed: 0, skipped: 0 },
        previous: { sent: 0, reached: 0, failed: 0, clicks: 0, journey: zeroJourney },
      }),
    });
    render(<AutomationOverview automation={automation({ status: "DRAFT" })} />);

    expect(await screen.findByRole("heading", { name: "No numbers yet" })).toBeTruthy();
    expect(screen.getByText(/Turn it on and this fills in from the first matching comment or message/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Key numbers" })).toBeNull();
    expect(screen.queryByRole("img", { name: /daily replies/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Review and turn on" }).getAttribute("href")).toBe("/automations/auto_1/edit");
  });

  it("flags recent failures at the top and lists them", async () => {
    stubApi({ failures: [{ kind: "CLASSIC_ACTION", state: "FAILED", attemptCount: 2, automationId: "auto_1", lastError: "(#4) Application request limit reached", updatedAt: new Date().toISOString() }] });
    render(<AutomationOverview automation={automation()} />);

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("1 message couldn't be sent in the last 7 days.");
    expect(within(status).getByRole("link", { name: "Review" }).getAttribute("href")).toBe("#automation-problems");
    expect(within(screen.getByRole("region", { name: "Delivery issues" })).getByText("Tried 2 times")).toBeTruthy();
  });

  it("previews the latest people it answered, linking to the full activity", async () => {
    stubApi();
    render(<AutomationOverview automation={automation({ provider: "FACEBOOK", facebookPageId: "page_1" })} />);

    const recent = await screen.findByRole("region", { name: "Recent activity" });
    expect(within(recent).getByRole("link", { name: "View all activity" }).getAttribute("href")).toBe("/automations/auto_1/activity");
    // A Facebook Page automation counts comments answered, not people reached.
    expect(await screen.findByText("Comments answered")).toBeTruthy();
  });

  it("offers a retry when the numbers fail to load", async () => {
    stubApi({ insightsStatus: 500 });
    render(<AutomationOverview automation={automation()} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The numbers didn’t load.");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("recent activity rows", () => {
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
