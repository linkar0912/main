// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationRecord } from "@/src/lib/repository";

const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/automations",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const { AutomationsScreen } = await import("./automations-screen");
const { AutomationSectionsShell } = await import("./automation-sections-shell");
const { clearAutomationsCache } = await import("./automation-list");
const { clearAutomationStatsCache } = await import("./automation-signals");
const { clearWorkspaceDataCache } = await import("@/src/lib/client/workspace-data");

function automation(id: string, name: string, status: AutomationRecord["status"]): AutomationRecord {
  return {
    id,
    workspaceId: "workspace_1",
    provider: "INSTAGRAM",
    name,
    status,
    version: 1,
    priority: 0,
    definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hi" }] },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  } as AutomationRecord;
}

const LIST = [
  automation("a_live", "Price list", "ACTIVE"),
  automation("a_broken", "Welcome DMs", "ACTIVE"),
  automation("a_draft", "Bridal consult", "DRAFT"),
  automation("a_paused", "Restock waitlist", "PAUSED"),
];

function stubApi({ automations = LIST, automationsStatus = 200 }: { automations?: AutomationRecord[]; automationsStatus?: number } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/workspace/bootstrap")) {
      return new Response(JSON.stringify({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }));
    }
    if (url === "/api/automations") {
      return automationsStatus === 200 ? new Response(JSON.stringify({ data: automations })) : new Response(null, { status: automationsStatus });
    }
    if (url.includes("/api/meta/connection")) {
      return new Response(JSON.stringify({ data: [{ id: "c1", igUserId: "ig_1", username: "studio", status: "CONNECTED", connectedAt: "2026-01-01T00:00:00.000Z" }] }));
    }
    if (url.includes("/api/facebook/connection")) return new Response(JSON.stringify({ data: [] }));
    if (url.startsWith("/api/automations/deliveries")) {
      return new Response(JSON.stringify({ data: [{ kind: "CLASSIC_ACTION", state: "FAILED", attemptCount: 1, automationId: "a_broken", updatedAt: new Date().toISOString() }] }));
    }
    if (url.startsWith("/api/insights")) {
      return new Response(JSON.stringify({ automations: [{ automationId: "a_live", sent: 126, failed: 0, skipped: 0 }] }));
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }));
}

describe("AutomationsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearAutomationsCache();
    clearAutomationStatsCache();
    clearWorkspaceDataCache();
    navigation.search = "";
  });

  it("puts view tabs with counts under the header and keeps Sequences and Broadcasts one click away", async () => {
    stubApi();
    render(<AutomationSectionsShell><AutomationsScreen /></AutomationSectionsShell>);

    expect(await screen.findByRole("heading", { name: "Automations", level: 1 })).toBeTruthy();
    const tabs = screen.getByRole("tablist", { name: "Automation views" });
    await waitFor(() => expect(within(tabs).getByRole("tab", { name: "All 4" }).getAttribute("aria-selected")).toBe("true"));
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["All4", "Live2", "Drafts1", "Paused1"]);
    const sections = screen.getByRole("navigation", { name: "Automation sections" });
    expect(within(sections).getByRole("link", { name: "Sequences" }).getAttribute("href")).toBe("/automations/sequences");
    expect(within(sections).getByRole("link", { name: "Broadcasts" }).getAttribute("href")).toBe("/automations/broadcasts");
  });

  it("groups live automations with a recent failure under Needs attention and shows reply counts", async () => {
    stubApi();
    render(<AutomationsScreen />);

    const attention = await screen.findByRole("region", { name: "Needs attention (1)" });
    expect(within(attention).getByText("Welcome DMs")).toBeTruthy();
    expect(within(attention).getByRole("link", { name: "Fix Welcome DMs" }).getAttribute("href")).toBe("/automations/a_broken");
    expect(await screen.findByText("126 replies in 7 days")).toBeTruthy();
  });

  it("filters to one status from a tab and remembers it in the URL", async () => {
    stubApi();
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<AutomationsScreen />);

    fireEvent.click(await screen.findByRole("tab", { name: "Paused 1" }));
    expect(screen.getByText("Restock waitlist")).toBeTruthy();
    expect(screen.queryByText("Price list")).toBeNull();
    expect(String(replaceState.mock.calls.at(-1)?.[2])).toContain("view=paused");
    replaceState.mockRestore();
  });

  it("opens on the tab named in ?view=", async () => {
    navigation.search = "view=drafts";
    stubApi();
    render(<AutomationsScreen />);

    expect((await screen.findByRole("tab", { name: "Drafts 1" })).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Bridal consult")).toBeTruthy();
    expect(screen.queryByText("Price list")).toBeNull();
  });

  it("explains an empty tab and offers the way back to all automations", async () => {
    stubApi({ automations: [automation("a_live", "Price list", "ACTIVE")] });
    render(<AutomationsScreen />);

    fireEvent.click(await screen.findByRole("tab", { name: "Paused 0" }));
    expect(screen.getByText(/Nothing is paused/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all automations" }));
    expect(screen.getByRole("tab", { name: "All 1" }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows a useful message when the automations endpoint returns an empty error response", async () => {
    stubApi({ automations: [], automationsStatus: 502 });
    render(<AutomationSectionsShell><AutomationsScreen /></AutomationSectionsShell>);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your automations didn’t load");
    expect(within(alert).getByRole("button", { name: /try again/i })).toBeTruthy();
  });
});
