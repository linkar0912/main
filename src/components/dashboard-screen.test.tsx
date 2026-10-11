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

function stubDashboardFetch() {
  const sentPerDay = Array.from({ length: 14 }, (_, index) => ({
    day: `2026-08-${String(index + 1).padStart(2, "0")}`,
    count: index + 1,
  }));
  const participantsPerDay = sentPerDay.map((point) => ({ ...point, count: Math.max(1, point.count - 2) }));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/workspace/bootstrap")) return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
    if (url.includes("/api/meta/connection")) return { ok: true, json: async () => ({ data: [{}] }) } as Response;
    if (url.includes("/api/insights")) return { ok: true, json: async () => ({ timeseries: { sentPerDay, participantsPerDay } }) } as Response;
    throw new Error(`Unexpected fetch to ${url}`);
  }));
}

/** Stubs a workspace where nothing has ever happened: no replies, no reach, no captured emails. */
function stubEmptyDashboardFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/workspace/bootstrap")) return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
    if (url.includes("/api/meta/connection")) return { ok: true, json: async () => ({ data: [{}] }) } as Response;
    if (url.includes("/api/insights")) {
      const days = Array.from({ length: 14 }, (_, index) => ({ day: `2026-08-${String(index + 1).padStart(2, "0")}`, count: 0 }));
      return { ok: true, json: async () => ({ timeseries: { sentPerDay: days, participantsPerDay: days }, capturedEmails: 0, optedOut: 0 }) } as Response;
    }
    throw new Error(`Unexpected fetch to ${url}`);
  }));
}

describe("DashboardScreen onboarding", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    automationState.loading = false;
    automationState.error = "";
    automationState.automations = [];
  });

  it("does not claim Instagram is disconnected while connection state is loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    render(<DashboardScreen />);

    expect(screen.queryByText("Connect your Instagram account")).toBeNull();
  });

  it("reuses warm overview data when the window regains focus", async () => {
    stubDashboardFetch();
    const fetchMock = vi.mocked(fetch);
    render(<DashboardScreen />);
    await screen.findByRole("img", { name: /daily replies sent and people reached/i });

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/insights?include=overview"))).toHaveLength(1));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/meta/connection"))).toHaveLength(1);
  });

  it("treats a connected Facebook Page as a connected channel", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/workspace/bootstrap")) return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
      if (url.includes("/api/meta/connection")) return { ok: true, json: async () => ({ data: [] }) } as Response;
      if (url.includes("/api/facebook/connection")) return { ok: true, json: async () => ({ data: [{ id: "fb_1", pageId: "page_1", pageName: "Linkar Page", status: "CONNECTED", connectedAt: "2026-08-30T00:00:00.000Z" }] }) } as Response;
      if (url.includes("/api/insights")) return { ok: true, json: async () => ({ timeseries: {} }) } as Response;
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    render(<DashboardScreen />);

    expect(await screen.findByText("1 of 3 done")).toBeTruthy();
    expect(screen.getByText("Connect an Instagram account or Facebook Page").closest(".setup-row")?.classList.contains("is-done")).toBe(true);
  });

  it("greets the signed-in user by a friendly first name", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/workspace/bootstrap")) {
        return {
          ok: true,
          json: async () => ({ data: { email: "tejas.creator@example.com", role: "OWNER", plan: "free" } }),
        } as Response;
      }
      if (url.includes("/api/meta/connection")) {
        return { ok: true, json: async () => ({ data: [] }) } as Response;
      }
      if (url.includes("/api/insights")) {
        return { ok: true, json: async () => ({ timeseries: {} }) } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }));

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

  it("replaces stat skeletons with an error and a retry when insights fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/insights")) return { ok: false, status: 500, json: async () => ({ error: "boom" }) } as Response;
      return { ok: true, json: async () => ({ data: [] }) } as Response;
    }));
    render(<DashboardScreen />);

    const chart = await screen.findByRole("region", { name: "Performance over time" });
    expect(await within(chart).findByRole("button", { name: "Try again" })).toBeTruthy();
    expect(document.querySelectorAll(".kpi-grid .kpi-skeleton")).toHaveLength(0);
    expect(screen.getAllByText("Couldn’t load")).toHaveLength(3);
  });

  it("stops showing loading placeholders when insights never answer", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
      render(<DashboardScreen />);
      expect(document.querySelectorAll(".kpi-grid .kpi-skeleton").length).toBeGreaterThan(0);

      await act(async () => { await vi.advanceTimersByTimeAsync(INSIGHTS_TIMEOUT_MS + 10); });

      expect(document.querySelectorAll(".kpi-grid .kpi-skeleton")).toHaveLength(0);
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows Start here only after an empty automation list has loaded", async () => {
    stubDashboardFetch();
    automationState.loading = true;
    const view = render(<DashboardScreen />);
    expect(screen.queryByRole("region", { name: "Start here" })).toBeNull();

    automationState.loading = false;
    automationState.automations = [{
      id: "automation_1", workspaceId: "workspace_1", provider: "INSTAGRAM", name: "Welcome",
      status: "ACTIVE", version: 1, priority: 0,
      definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [] },
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    }];
    view.rerender(<DashboardScreen />);
    expect(screen.queryByRole("region", { name: "Start here" })).toBeNull();

    automationState.automations = [];
    view.rerender(<DashboardScreen />);
    expect(screen.getByRole("region", { name: "Start here" })).toBeTruthy();
  });

  it("waits for automations before calculating first-step completion", async () => {
    automationState.loading = true;
    let resolveConnection!: (response: Response) => void;
    const connectionResponse = new Promise<Response>((resolve) => {
      resolveConnection = resolve;
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/api/meta/connection")) return connectionResponse;
      return new Promise<Response>(() => {});
    }));

    render(<DashboardScreen />);
    await act(async () => {
      resolveConnection({ ok: true, json: async () => ({ data: [] }) } as Response);
      await connectionResponse;
    });

    expect(screen.queryByText("Connect your Instagram account")).toBeNull();
  });

  it("labels a draft automation as Draft instead of Paused", async () => {
    automationState.automations = [{
      id: "automation_draft",
      workspaceId: "workspace_1",
      provider: "INSTAGRAM",
      name: "Story welcome",
      status: "DRAFT",
      version: 1, priority: 0,
      definition: { version: 1, trigger: { type: "story_mention" }, conditions: [], actions: [] },
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
    }];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/workspace/bootstrap")) return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
      if (url.includes("/api/meta/connection")) return { ok: true, json: async () => ({ data: [{}] }) } as Response;
      if (url.includes("/api/insights")) return { ok: true, json: async () => ({ timeseries: {} }) } as Response;
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    render(<DashboardScreen />);

    expect(await screen.findByText("Draft")).toBeTruthy();
    expect(screen.queryByText("Paused")).toBeNull();
  });

  it("labels referral and opt-in automations by their real trigger, not as comment replies", async () => {
    const base = {
      workspaceId: "workspace_1", provider: "INSTAGRAM" as const, status: "ACTIVE" as const, version: 1, priority: 0,
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    };
    automationState.automations = [
      { ...base, id: "a_referral", name: "Ref flow", definition: { version: 1, trigger: { type: "referral" }, conditions: [], actions: [] } },
      { ...base, id: "a_optin", name: "Optin flow", definition: { version: 1, trigger: { type: "optin" }, conditions: [], actions: [] } },
    ];
    stubDashboardFetch();
    render(<DashboardScreen />);

    expect(await screen.findByText("Referral link taps")).toBeTruthy();
    expect(screen.getByText("Permission button taps")).toBeTruthy();
    expect(screen.queryByText("Comment replies")).toBeNull();
  });

  it("says what each Start here recipe does", async () => {
    stubDashboardFetch();
    render(<DashboardScreen />);

    const startHere = await screen.findByRole("region", { name: "Start here" });
    expect(within(startHere).getAllByRole("link")).toHaveLength(3);
    expect(within(startHere).getByText(/they get your link in a DM/)).toBeTruthy();
    expect(within(startHere).queryByText("Quick Automation")).toBeNull();
  });

  it("does not treat an automations load failure as a brand-new workspace", async () => {
    stubDashboardFetch();
    const reload = vi.fn();
    automationState.error = "Could not load automations";
    automationState.reload = reload;
    render(<DashboardScreen />);

    expect(await screen.findByText("Your automations didn’t load")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Start here" })).toBeNull();
    expect(screen.queryByRole("region", { name: "First steps" })).toBeNull();
    expect(screen.queryByText("No automations yet")).toBeNull();
    const panel = screen.getByRole("region", { name: "Your automations" });
    fireEvent.click(within(panel).getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("renders activity as one continuous chart field", async () => {
    stubDashboardFetch();
    render(<DashboardScreen />);

    const chart = await screen.findByRole("img", { name: /daily replies sent and people reached/i });
    expect(chart.closest(".chart-plot")).toBeTruthy();
    expect(chart.querySelectorAll(".chart-column")).toHaveLength(14);
  });

  it("marks the Popular recipe with the shared brand badge", async () => {
    stubDashboardFetch();
    render(<DashboardScreen />);

    expect((await screen.findByText("Popular")).classList.contains("quickstart-badge")).toBe(true);
  });
  it("replaces the chart with an empty state when nothing has happened yet", async () => {
    stubEmptyDashboardFetch();
    render(<DashboardScreen />);

    expect(await screen.findByText(/No replies yet in the last 14 days/i)).toBeTruthy();
    expect(document.querySelector(".dashboard-chart-skeleton")).toBeNull();
    expect(screen.queryByRole("img", { name: /daily replies sent and people reached/i })).toBeNull();
  });

  it("shows the four headline metrics as one row of tiles above the chart", async () => {
    stubDashboardFetch();
    render(<DashboardScreen />);

    await screen.findByRole("img", { name: /daily replies sent and people reached/i });

    const tiles = [...document.querySelectorAll(".kpi-grid .kpi-tile")];
    expect(tiles).toHaveLength(4);
    for (const label of ["Replies sent", "People reached", "Emails captured", "Automations on"]) {
      expect(tiles.some((tile) => tile.textContent?.includes(label))).toBe(true);
    }
  });
});
