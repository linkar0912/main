// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationRecord } from "@/src/lib/repository";

const automationState = vi.hoisted(() => ({ automations: [] as AutomationRecord[] }));

vi.mock("next/navigation", () => ({ usePathname: () => "/insights" }));
vi.mock("./automation-list", () => ({
  useAutomations: () => ({ automations: automationState.automations, loading: false, error: "", reload: () => undefined }),
}));

const { InsightsScreen } = await import("./insights-screen");

function automation(id: string, name: string, overrides: Partial<AutomationRecord> = {}): AutomationRecord {
  return {
    id, name, workspaceId: "workspace_1", provider: "INSTAGRAM", status: "ACTIVE", version: 1, priority: 0,
    definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [] },
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as AutomationRecord;
}

function day(index: number) {
  return `2026-09-${String(index + 1).padStart(2, "0")}`;
}

function payload(days = 14, scale = 1) {
  return {
    funnel: { COMMENT_MATCHED: 2, OPENING_SENT: 2, OPTED_IN: 2, LINK_SENT: 5, FAILED: 1 },
    journey: { commented: 120, openingSent: 110, optedIn: 60, followed: 55, linkSent: 52 },
    timeseries: {
      days,
      // Deliberately newest-first: the chart owns chronological order.
      sentPerDay: Array.from({ length: days }, (_, index) => ({ day: day(index), count: 10 * scale })).reverse(),
      participantsPerDay: Array.from({ length: days }, (_, index) => ({ day: day(index), count: 5 * scale })),
    },
    previous: { sent: 100, reached: 50 },
    automations: [
      { automationId: "a_price", sent: 90 * scale, failed: 10, skipped: 0 },
      { automationId: "a_welcome", sent: 50 * scale, failed: 0, skipped: 4 },
    ],
    mediaPerformance: [
      { mediaId: "18101928374650011", matched: 8, delivered: 6, clicked: 3 },
      { mediaId: "18042217893305561", matched: 4, delivered: 3, clicked: 1 },
    ],
    capturedEmails: 7,
    optedOut: 2,
    usage: { deliveriesThisMonth: 12, monthlyDeliveryLimit: null },
  };
}

type Handler = (url: string) => Response | Promise<Response> | undefined;

function stubFetch(insights: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/insights?")) {
      const answer = await insights(url);
      if (answer) return answer;
    }
    if (url.startsWith("/api/links")) return new Response(JSON.stringify({ data: [] }));
    if (url === "/api/meta/media") {
      return new Response(JSON.stringify({ data: [{ id: "18101928374650011", caption: "Diwali edit drop 1", permalink: "https://www.instagram.com/reel/abc/", thumbnailUrl: "https://scontent.cdninstagram.com/a.jpg" }] }));
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("InsightsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    automationState.automations = [];
  });

  it("uses the page-shaped Insights loader while data is pending", () => {
    stubFetch(() => new Promise<Response>(() => undefined));
    render(<InsightsScreen />);
    expect(screen.getByLabelText("Loading insights data")).toBeTruthy();
  });

  it("opens with a plain-language headline about the selected window", async () => {
    automationState.automations = [automation("a_price", "Price list"), automation("a_welcome", "Welcome DMs")];
    stubFetch(() => new Response(JSON.stringify(payload())));
    render(<InsightsScreen />);

    // 14 days x 10 = 140 replies against 100 before.
    expect((await screen.findByRole("heading", { name: "Replies are up 40% on the previous 14 days." })).tagName).toBe("H2");
    expect(screen.getByText(/140 replies reached 70 people\. Price list sent the most \(90\)\./)).toBeTruthy();
  });

  it("asks for the chosen range and automation, and keeps the numbers on screen while the next answer loads", async () => {
    automationState.automations = [automation("a_price", "Price list"), automation("a_welcome", "Welcome DMs")];
    let releaseWeek!: () => void;
    const fetchMock = stubFetch((url) => {
      if (url.includes("days=7")) {
        return new Promise<Response>((resolve) => { releaseWeek = () => resolve(new Response(JSON.stringify(payload(7, 2)))); });
      }
      return new Response(JSON.stringify(payload()));
    });
    render(<InsightsScreen />);
    await screen.findByRole("img", { name: /last 14 days/ });

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/insights?days=7")).toBe(true));
    // No skeleton flash: the old chart stays, dimmed, until the new numbers arrive.
    expect(screen.queryByLabelText("Loading insights data")).toBeNull();
    expect(document.querySelector(".ins-content")?.hasAttribute("data-refreshing")).toBe(true);
    releaseWeek();
    expect(await screen.findByRole("img", { name: /last 7 days/ })).toBeTruthy();
    expect(document.querySelector(".ins-content")?.hasAttribute("data-refreshing")).toBe(false);
    expect(screen.getByRole("button", { name: "7 days" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(screen.getByLabelText("Automation"), { target: { value: "a_price" } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/insights?days=7&automationId=a_price")).toBe(true));
    expect(screen.getByRole("link", { name: /export csv/i }).getAttribute("href")).toBe("/api/insights/export?automationId=a_price");
  });

  it("renders every chart day once in chronological order", async () => {
    stubFetch(() => new Response(JSON.stringify(payload())));
    render(<InsightsScreen />);

    const plot = await screen.findByRole("group", { name: /use the left and right arrow keys/i });
    fireEvent.keyDown(plot, { key: "Home" });
    const readout = document.getElementById(plot.getAttribute("aria-describedby") ?? "");
    expect(readout?.textContent).toMatch(/^1 Sept:/);
    fireEvent.keyDown(plot, { key: "End" });
    expect(readout?.textContent).toMatch(/^14 Sept:/);
  });

  it("shows the funnel as cumulative steps and names the biggest drop", async () => {
    stubFetch(() => new Response(JSON.stringify(payload())));
    render(<InsightsScreen />);

    const journey = await screen.findByRole("region", { name: "From comment to link" });
    const steps = within(journey).getAllByRole("listitem");
    expect(steps.map((step) => step.querySelector(".ins-journey-label")?.textContent)).toEqual(["Commented", "Got the DM", "Opted in", "Followed", "Got the link"]);
    expect(steps[2].textContent).toContain("55% kept");
    expect(within(journey).getByText(/The biggest drop is at “Opted in”/)).toBeTruthy();
  });

  it("says nobody has gone through a flow instead of listing five zeros", async () => {
    stubFetch(() => new Response(JSON.stringify({ ...payload(), journey: { commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 } })));
    render(<InsightsScreen />);

    expect(await screen.findByText(/Nobody has gone through a comment-to-link flow yet/)).toBeTruthy();
  });

  it("names top posts by caption with a link to the post, falling back to an ID chip", async () => {
    stubFetch(() => new Response(JSON.stringify(payload())));
    render(<InsightsScreen />);

    const posts = await screen.findByRole("region", { name: "Top posts" });
    const title = await within(posts).findByRole("link", { name: "Diwali edit drop 1" });
    expect(title.getAttribute("href")).toBe("https://www.instagram.com/reel/abc/");
    expect(within(posts).getByText("Instagram post")).toBeTruthy();
    expect(within(posts).getByText("4 comments matched, 1 click, 33% clicked")).toBeTruthy();
  });

  it("sorts the per-automation table by any column", async () => {
    automationState.automations = [automation("a_price", "Price list"), automation("a_welcome", "Welcome DMs")];
    stubFetch(() => new Response(JSON.stringify(payload())));
    render(<InsightsScreen />);

    const table = await screen.findByRole("table", { name: /automation results/i });
    const names = () => within(table).getAllByRole("rowheader").map((cell) => cell.textContent);
    expect(names()[0]).toContain("Price list");
    const deliveredHeader = within(table).getByRole("columnheader", { name: /delivered/i });
    fireEvent.click(within(deliveredHeader).getByRole("button"));
    expect(deliveredHeader.getAttribute("aria-sort")).toBe("descending");
    expect(names()[0]).toContain("Welcome DMs");
    expect(within(table).getAllByRole("row")[1].textContent).toContain("100%");
  });

  it("states that collected emails count the whole workspace", async () => {
    stubFetch(() => new Response(JSON.stringify(payload())));
    render(<InsightsScreen />);

    const people = await screen.findByRole("region", { name: "People you collected" });
    expect(within(people).getByText(/whole workspace, all time/)).toBeTruthy();
    expect(within(people).getByText("7")).toBeTruthy();
  });

  it("explains what will appear when there is no data yet", async () => {
    stubFetch(() => new Response(JSON.stringify({
      ...payload(),
      timeseries: { days: 14, sentPerDay: [], participantsPerDay: [] },
      previous: { sent: 0, reached: 0 },
      journey: { commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 },
      automations: [],
      mediaPerformance: [],
    })));
    render(<InsightsScreen />);

    expect(await screen.findByRole("heading", { name: "Nothing to show yet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /create an automation/i })).toBeTruthy();
  });

  it("offers a retry when insights cannot be loaded", async () => {
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ error: "Insights are unavailable" }), { status: 500 })
        : new Response(JSON.stringify(payload()));
    });
    render(<InsightsScreen />);

    expect(await screen.findByText(/Insights are unavailable/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("img", { name: /last 14 days/ })).toBeTruthy();
  });

  it("keeps tracked link management on the page", async () => {
    stubFetch(() => new Response(JSON.stringify(payload())));
    render(<InsightsScreen />);

    expect(document.getElementById("tracked-links")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Tracked links" })).toBeTruthy();
  });
});
