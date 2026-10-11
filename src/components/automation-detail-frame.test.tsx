// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationRecord } from "@/src/lib/repository";

const navigation = vi.hoisted(() => ({ pathname: "/automations/auto_1", push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push, refresh: navigation.refresh }),
}));
vi.mock("./automation-versions-modal", () => ({ AutomationVersionsModal: () => <div role="dialog" aria-label="Version history" /> }));

const { AutomationDetailFrame, detailTabFor } = await import("./automation-detail-frame");

function automation(overrides: Partial<AutomationRecord> = {}): AutomationRecord {
  return {
    id: "auto_1",
    workspaceId: "workspace_1",
    provider: "INSTAGRAM",
    name: "Price list",
    status: "ACTIVE",
    version: 3,
    priority: 0,
    definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hi" }] },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  } as AutomationRecord;
}

function renderFrame(record = automation()) {
  return render(
    <AutomationDetailFrame automationId={record.id} initialAutomation={record}>
      <p>Tab content</p>
    </AutomationDetailFrame>,
  );
}

describe("AutomationDetailFrame", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    navigation.pathname = "/automations/auto_1";
    navigation.push.mockReset();
    navigation.refresh.mockReset();
  });

  it("knows which tab a path is", () => {
    expect(detailTabFor("/automations/auto_1")).toBe("overview");
    expect(detailTabFor("/automations/auto_1/activity")).toBe("activity");
    expect(detailTabFor("/automations/auto_1/edit")).toBe("edit");
  });

  it("names the automation and links Overview and Edit as tabs, current one marked", () => {
    renderFrame();

    expect(screen.getByRole("heading", { level: 1, name: "Price list" })).toBeTruthy();
    const tabs = screen.getByRole("navigation", { name: "Automation views" });
    expect(within(tabs).getAllByRole("link").map((link) => link.textContent)).toEqual(["Overview", "Edit"]);
    expect(within(tabs).getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
    expect(within(tabs).getByRole("link", { name: "Edit" }).getAttribute("href")).toBe("/automations/auto_1/edit");
    expect(screen.getByText("Tab content")).toBeTruthy();
  });

  it("adds the Activity tab for campaigns and Facebook Page automations", () => {
    renderFrame(automation({ provider: "FACEBOOK", facebookPageId: "page_1" }));

    const tabs = screen.getByRole("navigation", { name: "Automation views" });
    expect(within(tabs).getByRole("link", { name: "Activity" }).getAttribute("href")).toBe("/automations/auto_1/activity");
  });

  it("offers Export CSV on Activity and hides the switch and Edit button on Edit", () => {
    navigation.pathname = "/automations/auto_1/activity";
    const { unmount } = renderFrame(automation({ provider: "FACEBOOK", facebookPageId: "page_1" }));
    expect(screen.getByRole("link", { name: /export csv/i }).getAttribute("href")).toBe("/api/insights/export?automationId=auto_1");
    unmount();

    navigation.pathname = "/automations/auto_1/edit";
    renderFrame();
    expect(screen.queryByRole("button", { name: "Pause Price list" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit" })?.closest(".header-actions")).toBeFalsy();
    expect(screen.getByText("Live")).toBeTruthy();
  });

  it("pauses from the header switch and shows the new state", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PATCH");
      expect(init?.body).toBe(JSON.stringify({ status: "PAUSED" }));
      return new Response(JSON.stringify({ data: automation({ status: "PAUSED" }) }));
    }));
    renderFrame();

    fireEvent.click(screen.getByRole("button", { name: "Pause Price list" }));
    expect(await screen.findByRole("button", { name: "Turn on Price list" })).toBeTruthy();
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it("says why turning on was refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Instagram must be connected before activation." }), { status: 409 })));
    renderFrame(automation({ status: "DRAFT" }));

    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Instagram must be connected before activation.");
  });

  it("deletes only after the confirm step, then returns to the list", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ deleted: true })));
    vi.stubGlobal("fetch", fetchMock);
    renderFrame();

    fireEvent.click(screen.getByRole("button", { name: "More actions for Price list" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Price list" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Confirm delete Price list" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/automations"));
    expect(fetchMock).toHaveBeenCalledWith("/api/automations/auto_1", { method: "DELETE" });
  });

  it("re-reads the automation when the tab changes, so a rename in Edit shows up", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: automation({ name: "Price list v2" }) })));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = renderFrame();
    expect(fetchMock).not.toHaveBeenCalled();

    navigation.pathname = "/automations/auto_1/edit";
    rerender(
      <AutomationDetailFrame automationId="auto_1" initialAutomation={automation()}>
        <p>Tab content</p>
      </AutomationDetailFrame>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Price list v2" })).toBeTruthy();
  });
});
