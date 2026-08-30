// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationRecord } from "@/src/lib/repository";

const automationState = vi.hoisted(() => ({ loading: false, automations: [] as AutomationRecord[] }));

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("./automation-list", () => ({
  useAutomations: () => ({ automations: automationState.automations, loading: automationState.loading }),
}));

const { DashboardScreen } = await import("./dashboard-screen");

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
    if (url.includes("/api/contacts")) return { ok: true, json: async () => ({ data: { count: 0 } }) } as Response;
    if (url.includes("/api/health")) return { ok: true, json: async () => ({ mode: "configured" }) } as Response;
    if (url.includes("/api/insights")) return { ok: true, json: async () => ({ timeseries: { sentPerDay, participantsPerDay } }) } as Response;
    throw new Error(`Unexpected fetch to ${url}`);
  }));
}

describe("DashboardScreen onboarding", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    automationState.loading = false;
    automationState.automations = [];
  });

  it("does not claim Instagram is disconnected while connection state is loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    render(<DashboardScreen />);

    expect(screen.queryByText("Connect your Instagram account")).toBeNull();
  });

  it("treats a connected Facebook Page as a connected channel", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/workspace/bootstrap")) return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
      if (url.includes("/api/meta/connection")) return { ok: true, json: async () => ({ data: [] }) } as Response;
      if (url.includes("/api/facebook/connection")) return { ok: true, json: async () => ({ data: [{ id: "fb_1", pageId: "page_1", pageName: "Linkar Page", status: "CONNECTED", connectedAt: "2026-08-30T00:00:00.000Z" }] }) } as Response;
      if (url.includes("/api/contacts")) return { ok: true, json: async () => ({ data: { count: 0 } }) } as Response;
      if (url.includes("/api/health")) return { ok: true, json: async () => ({ mode: "configured" }) } as Response;
      if (url.includes("/api/insights")) return { ok: true, json: async () => ({ timeseries: {} }) } as Response;
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    render(<DashboardScreen />);

    expect(await screen.findByText("1/3 done")).toBeTruthy();
    expect(screen.getByText("Connect an Instagram account or Facebook Page").closest(".setup-row")?.classList.contains("is-done")).toBe(true);
  });

  it("greets the signed-in user by their account handle", async () => {
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
      if (url.includes("/api/contacts")) {
        return { ok: true, json: async () => ({ data: { count: 0 } }) } as Response;
      }
      if (url.includes("/api/health")) {
        return { ok: true, json: async () => ({ mode: "configured" }) } as Response;
      }
      if (url.includes("/api/insights")) {
        return { ok: true, json: async () => ({ timeseries: {} }) } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    render(<DashboardScreen />);

    expect(await screen.findByRole("heading", { name: "Hello, Tejas Creator!" })).toBeTruthy();
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
      if (url.includes("/api/contacts")) return { ok: true, json: async () => ({ data: { count: 0 } }) } as Response;
      if (url.includes("/api/health")) return { ok: true, json: async () => ({ mode: "configured" }) } as Response;
      if (url.includes("/api/insights")) return { ok: true, json: async () => ({ timeseries: {} }) } as Response;
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    render(<DashboardScreen />);

    expect(await screen.findByText("Draft")).toBeTruthy();
    expect(screen.queryByText("Paused")).toBeNull();
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
});
