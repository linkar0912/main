// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationRecord } from "@/src/lib/repository";

const automationState = vi.hoisted(() => ({ loading: false, error: "", automations: [] as AutomationRecord[], reload: (() => undefined) as () => void }));

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("./automation-list", () => ({
  useAutomations: () => ({ automations: automationState.automations, loading: automationState.loading, error: automationState.error, reload: automationState.reload }),
}));

const { DashboardScreen, INSIGHTS_TIMEOUT_MS } = await import("./dashboard-screen");
const { AppShell } = await import("./app-shell");
const { clearWorkspaceDataCache } = await import("@/src/lib/client/workspace-data");

function automation(overrides: Partial<AutomationRecord> = {}): AutomationRecord {
  return {
    id: "automation_1", workspaceId: "workspace_1", provider: "INSTAGRAM", name: "Welcome",
    status: "ACTIVE", version: 1, priority: 0,
    definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [] },
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as AutomationRecord;
}

type StubOptions = {
  sent?: number[];
  previousSent?: number;
  instagram?: unknown[];
  facebook?: unknown[];
  failures?: unknown[];
  usage?: { deliveriesThisMonth: number; monthlyDeliveryLimit: number | null };
  captured?: number;
  email?: string;
};

function stubDashboardFetch({
  sent = Array.from({ length: 14 }, (_, index) => index + 1),
  previousSent = 50,
  instagram = [{ username: "studio.kavya", status: "CONNECTED" }],
  facebook = [],
  failures = [],
  usage = { deliveriesThisMonth: 10, monthlyDeliveryLimit: 1_000 },
  captured = 12,
  email = "owner@example.com",
}: StubOptions = {}) {
  const sentPerDay = sent.map((count, index) => ({ day: `2026-08-${String(index + 1).padStart(2, "0")}`, count }));
  const participantsPerDay = sentPerDay.map((point) => ({ ...point, count: Math.max(0, point.count - 1) }));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
    if (url.includes("/api/workspace/bootstrap")) return ok({ data: { email, role: "OWNER", plan: "free" } });
    if (url.includes("/api/meta/connection")) return ok({ data: instagram });
    if (url.includes("/api/facebook/connection")) return ok({ data: facebook });
    if (url.includes("/api/insights/failures")) return ok({ data: failures });
    if (url.includes("/api/insights?include=usage")) return ok({ usage });
    if (url.includes("/api/insights")) {
      return ok({ timeseries: { days: 14, sentPerDay, participantsPerDay }, previous: { sent: previousSent, reached: previousSent }, capturedEmails: captured, optedOut: 0 });
    }
    throw new Error(`Unexpected fetch to ${url}`);
  }));
}

describe("DashboardScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearWorkspaceDataCache();
    automationState.loading = false;
    automationState.error = "";
    automationState.automations = [];
  });

  it("does not claim the account is disconnected while connection state is loading", () => {
    automationState.automations = [automation()];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    render(<DashboardScreen />);

    expect(screen.getByText("Checking your connected accounts…")).toBeTruthy();
    expect(screen.queryByText(/No account connected/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Needs you" })).toBeNull();
  });

  it("reuses warm overview data when the window regains focus", async () => {
    automationState.automations = [automation()];
    stubDashboardFetch();
    const fetchMock = vi.mocked(fetch);
    render(<DashboardScreen />);
    await screen.findByRole("img", { name: /daily replies sent and people reached/i });

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/insights?include=overview"))).toHaveLength(1));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/meta/connection"))).toHaveLength(1);
  });

  it("says where Linkar is replying from, counting a Facebook Page as a channel", async () => {
    automationState.automations = [automation(), automation({ id: "automation_2", name: "Draft", status: "DRAFT" })];
    stubDashboardFetch({ instagram: [], facebook: [{ id: "fb_1", pageId: "page_1", pageName: "Linkar Page", status: "CONNECTED", connectedAt: "2026-08-30T00:00:00.000Z" }] });

    render(<DashboardScreen />);

    expect(await screen.findByText("Replying on Linkar Page. 1 of 2 automations are on.")).toBeTruthy();
    expect(await screen.findByText("Nothing needs you right now.")).toBeTruthy();
  });

  it("greets the signed-in user by a friendly first name", async () => {
    stubDashboardFetch({ instagram: [], email: "tejas.creator@example.com" });

    // The greeting reads the account identity from the shell context; in the
    // app that context comes from the (app) route group's layout, so the test
    // wraps the screen in AppShell the same way.
    render(<AppShell><DashboardScreen /></AppShell>);

    const heading = await screen.findByRole("heading", { name: "Hello, Tejas" });
    const greeting = heading.closest("header");
    expect(greeting).toBeTruthy();
    expect(within(greeting as HTMLElement).getByRole("link", { name: "Quick automation" }).getAttribute("href")).toBe("/quick-automation");
  });

  it("drops trailing digits from the email handle and prefers a display name", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const view = render(<DashboardScreen initialEmail="tejastelkar9@gmail.com" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hello, Tejastelkar");

    view.rerender(<DashboardScreen initialEmail="tejastelkar9@gmail.com" initialDisplayName="Tejas Telkar" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hello, Tejas");
  });

  it("says Welcome back when the email has no usable name", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    render(<DashboardScreen initialEmail="admin@example.com" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Welcome back");
  });

  it("replaces loading figures with an error and a retry when insights fail", async () => {
    automationState.automations = [automation()];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/insights")) return { ok: false, status: 500, json: async () => ({ error: "boom" }) } as Response;
      return { ok: true, json: async () => ({ data: [] }) } as Response;
    }));
    render(<DashboardScreen />);

    const panel = await screen.findByRole("region", { name: "Performance over time" });
    expect(await within(panel).findByRole("button", { name: "Try again" })).toBeTruthy();
    expect(document.querySelectorAll(".perf-figure-skeleton")).toHaveLength(0);
  });

  it("stops showing loading placeholders when insights never answer", async () => {
    automationState.automations = [automation()];
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
      render(<DashboardScreen />);
      expect(document.querySelectorAll(".perf-figure-skeleton").length).toBeGreaterThan(0);

      await act(async () => { await vi.advanceTimersByTimeAsync(INSIGHTS_TIMEOUT_MS + 10); });

      expect(document.querySelectorAll(".perf-figure-skeleton")).toHaveLength(0);
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the guided start only after an empty automation list has loaded", async () => {
    stubDashboardFetch();
    automationState.loading = true;
    const view = render(<DashboardScreen />);
    expect(screen.queryByRole("region", { name: "Start here" })).toBeNull();

    automationState.loading = false;
    automationState.automations = [automation()];
    view.rerender(<DashboardScreen />);
    expect(screen.queryByRole("region", { name: "Start here" })).toBeNull();

    automationState.automations = [];
    view.rerender(<DashboardScreen />);
    expect(screen.getByRole("region", { name: "Start here" })).toBeTruthy();
    // A brand-new workspace gets the guided start instead of an empty dashboard.
    expect(screen.queryByRole("region", { name: "Performance over time" })).toBeNull();
  });

  it("opens the guided start on connecting when no account is linked yet", async () => {
    stubDashboardFetch({ instagram: [], facebook: [] });
    render(<DashboardScreen />);

    const start = await screen.findByRole("region", { name: "Start here" });
    expect((await within(start).findByRole("link", { name: "Connect an account" })).getAttribute("href")).toBe("/settings");
    // Recipes wait until there is somewhere to send from.
    expect(within(start).queryByRole("link", { name: /send a link when someone comments/i })).toBeNull();
  });

  it("says what each Start here recipe does once an account is connected", async () => {
    stubDashboardFetch();
    render(<DashboardScreen />);

    const startHere = await screen.findByRole("region", { name: "Start here" });
    await within(startHere).findByText("Connected to @studio.kavya.");
    expect(within(startHere).getAllByRole("link")).toHaveLength(3);
    expect(within(startHere).getByText(/they get your link in a DM/)).toBeTruthy();
    expect(within(startHere).getByText("Popular").classList.contains("quickstart-badge")).toBe(true);
  });

  it("does not treat an automations load failure as a brand-new workspace", async () => {
    stubDashboardFetch();
    const reload = vi.fn();
    automationState.error = "Could not load automations";
    automationState.reload = reload;
    render(<DashboardScreen />);

    expect(await screen.findByText("Your automations didn’t load")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Start here" })).toBeNull();
    const panel = screen.getByRole("region", { name: "Your automations" });
    fireEvent.click(within(panel).getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("labels a draft automation as Draft instead of Paused", async () => {
    automationState.automations = [automation({
      id: "automation_draft", name: "Story welcome", status: "DRAFT",
      definition: { version: 1, trigger: { type: "story_mention" }, conditions: [], actions: [] },
    })];
    stubDashboardFetch();

    render(<DashboardScreen />);

    expect(await screen.findByText("Draft")).toBeTruthy();
    expect(screen.queryByText("Paused")).toBeNull();
  });

  it("labels referral and opt-in automations by their real trigger, not as comment replies", async () => {
    automationState.automations = [
      automation({ id: "a_referral", name: "Ref flow", definition: { version: 1, trigger: { type: "referral" }, conditions: [], actions: [] } }),
      automation({ id: "a_optin", name: "Optin flow", definition: { version: 1, trigger: { type: "optin" }, conditions: [], actions: [] } }),
    ];
    stubDashboardFetch();
    render(<DashboardScreen />);

    expect(await screen.findByText("Referral link taps")).toBeTruthy();
    expect(screen.getByText("Permission button taps")).toBeTruthy();
    expect(screen.queryByText("Comment replies")).toBeNull();
  });

  it("draws the last 14 days as two lines whose figures are the legend", async () => {
    automationState.automations = [automation()];
    stubDashboardFetch({ previousSent: 50 });
    render(<DashboardScreen />);

    const chart = await screen.findByRole("img", { name: /daily replies sent and people reached/i });
    expect(chart.querySelectorAll(".trend-line")).toHaveLength(2);
    const summary = screen.getByRole("list", { name: "Performance summary" });
    const figures = within(summary).getAllByRole("listitem");
    expect(figures.map((figure) => figure.querySelector(".perf-figure-label")?.textContent)).toEqual(["Replies sent", "People reached", "Emails collected"]);
    // 1 + 2 + ... + 14 = 105 replies against 50 in the 14 days before.
    await waitFor(() => expect(figures[0].querySelector(".perf-figure-value")?.textContent).toBe("105"));
    expect(figures[0].textContent).toContain("Up 110% on the previous 14 days");
  });

  it("replaces the chart with an empty state when nothing has happened yet", async () => {
    automationState.automations = [automation()];
    stubDashboardFetch({ sent: Array(14).fill(0), previousSent: 0, captured: 0 });
    render(<DashboardScreen />);

    expect(await screen.findByText(/No replies yet in the last 14 days/i)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /daily replies sent and people reached/i })).toBeNull();
  });

  it("lists what needs attention below the numbers and expands failures in place", async () => {
    automationState.automations = [automation(), automation({ id: "automation_paused", name: "Kurta restock", status: "PAUSED" })];
    stubDashboardFetch({
      failures: [{ id: "f1", kind: "CLASSIC_ACTION", state: "FAILED", lastError: "(#551) This person isn't available right now.", attemptCount: 2, updatedAt: new Date().toISOString() }],
      usage: { deliveriesThisMonth: 950, monthlyDeliveryLimit: 1_000 },
    });
    render(<DashboardScreen />);

    const needs = await screen.findByRole("region", { name: "Needs you" });
    await within(needs).findByText("1 message couldn't be sent in the last 7 days.");
    expect(within(needs).getByText("950 of 1,000 messages used this month (95%).")).toBeTruthy();
    expect(within(needs).getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/automations/automation_paused/edit");
    // "Needs you" sits below the performance panel, above tracked links.
    const panel = screen.getByRole("region", { name: "Performance over time" });
    expect(needs.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    const links = screen.getByRole("region", { name: "Tracked links" });
    expect(needs.compareDocumentPosition(links) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const review = within(needs).getByRole("button", { name: "Review" });
    expect(review.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(review);
    expect(review.getAttribute("aria-expanded")).toBe("true");
    expect(within(needs).getByRole("list", { name: "Recent failed deliveries" })).toBeTruthy();
    expect(screen.queryByText("Nothing needs you right now.")).toBeNull();
  });

  it("keeps tracked links one click away", async () => {
    automationState.automations = [automation()];
    stubDashboardFetch();
    render(<DashboardScreen />);

    const links = screen.getByRole("region", { name: "Tracked links" });
    expect(within(links).getByRole("link", { name: "Manage links" }).getAttribute("href")).toBe("/insights#tracked-links");
  });
});
