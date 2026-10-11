// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789abc" });
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { WorkspaceDetailScreen } = await import("./workspace-detail-screen");
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
const workspace = { id: "w1", name: "Acme", slug: "acme", status: "ACTIVE" as const, createdAt: "2026-08-31T00:00:00Z", updatedAt: "2026-08-31T00:00:00Z", version: 2, planKey: "growth", planName: "Growth", memberCount: 1, automationCount: 4, instagramConnectionCount: 1, facebookConnectionCount: 0, members: [{ userId: "u1", email: "owner@acme.test", role: "OWNER" }] };

async function openAction(name: RegExp | string) {
  await userEvent.click(screen.getByRole("button", { name: "Actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name }));
  return screen.getByRole("dialog");
}

describe("WorkspaceDetailScreen", () => {
  it("renders the workspace header, owner, plan sticker and real tabs", async () => {
    render(<WorkspaceDetailScreen workspace={workspace} />);
    expect(screen.getByRole("heading", { name: "Acme", level: 1 })).toBeTruthy();
    expect(screen.getByText("Owner owner@acme.test")).toBeTruthy();
    expect(document.querySelector(".plan-tag")?.textContent).toBe("Growth");
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    // No audit events were loaded, so the Activity tab is left out rather than shown empty.
    expect(tabs).toEqual(["Overview", "Usage & limits", "Members", "Connected accounts"]);
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    screen.getByRole("tab", { name: "Overview" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Usage & limits" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Usage & limits");
    expect(window.location.search).toBe("?tab=usage");
    expect(screen.getByRole("tabpanel", { name: "Usage & limits" })).toBeTruthy();
  });

  it("opens on the tab named in the URL", () => {
    render(<WorkspaceDetailScreen workspace={workspace} initialTab="members" />);
    const panel = screen.getByRole("tabpanel", { name: "Members" });
    expect(within(panel).getByRole("link", { name: "owner@acme.test" })).toBeTruthy();
    expect(within(panel).getByText("Owner")).toBeTruthy();
  });

  it("exports through an audited POST with its own reason and reports the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("type,id\n", { headers: { "content-type": "text/csv" } }));
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi.fn().mockReturnValue("blob:export");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<WorkspaceDetailScreen workspace={workspace} />);
    const dialog = await openAction("Export data");
    const download = within(dialog).getByRole("button", { name: "Download CSV" }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Reason/ }), "Customer data request");
    await userEvent.click(download);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/workspaces/w1/export", expect.objectContaining({ method: "POST", body: JSON.stringify({ format: "csv" }) }));
    expect(decodeURIComponent(fetchMock.mock.calls[0][1].headers["x-admin-reason"])).toBe("Customer data request");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
    expect((await screen.findByRole("status")).textContent).toBe("CSV export downloaded.");
    expect(screen.queryByRole("dialog")).toBeNull();
    vi.unstubAllGlobals();
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789abc" });
  });

  it("keeps a visible error in the dialog until the exact suspension phrase is entered", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceDetailScreen workspace={workspace} />);
    const dialog = await openAction("Suspend workspace");
    expect(within(dialog).getByText(/Everyone is locked out/)).toBeTruthy();
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Reason/ }), "Abuse investigation");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Type SUSPEND acme/ }), "wrong");
    await userEvent.click(within(dialog).getByRole("button", { name: "Suspend workspace" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("Type SUSPEND acme exactly");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789abc" });
  });

  it("pauses live automations with the version and a reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { paused: 3 } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceDetailScreen workspace={workspace} />);
    const dialog = await openAction("Pause live automations");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Reason/ }), "Loop reported");
    await userEvent.click(within(dialog).getByRole("button", { name: "Pause live automations" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/workspaces/w1/automations/pause", expect.objectContaining({ method: "POST", body: JSON.stringify({ version: 2 }) }));
    expect((await screen.findByRole("status")).textContent).toBe("3 live automations paused.");
    vi.unstubAllGlobals();
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789abc" });
  });
});

const entitlement = { plan: { id: "p1", key: "growth", name: "Growth" }, defaults: { memberLimit: 5, monthlyDeliveryLimit: 20000, exportsEnabled: true }, overrides: { monthlyDeliveryLimit: 30000 }, effective: { memberLimit: 5, exportsEnabled: true, monthlyDeliveryLimit: 30000, sequenceLimit: null }, version: 3, usage: { deliveriesReserved: 18432, broadcastsCreated: 0, periodStart: "2026-08-01T00:00:00Z" } };
const plans = [{ id: "p1", key: "growth", name: "Growth", isActive: true }];

describe("WorkspaceDetailScreen follow-up", () => {
  it("states empty member and connection lists", async () => {
    render(<WorkspaceDetailScreen workspace={{ ...workspace, members: [] }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Members" }));
    expect(screen.getByText("This workspace has no members.")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Connected accounts" }));
    expect(screen.getByText("No Instagram accounts or Facebook Pages are connected.")).toBeTruthy();
  });

  it("shows usage against each limit with the plan default and the custom value", async () => {
    render(<WorkspaceDetailScreen workspace={workspace} entitlement={entitlement} plans={plans} initialTab="usage" />);
    const panel = screen.getByRole("tabpanel", { name: "Usage & limits" });
    const messages = panel.querySelector('[data-limit="monthlyDeliveryLimit"]') as HTMLElement;
    expect(within(messages).getByText("18,432 of 30,000 messages · 61%")).toBeTruthy();
    expect(messages.textContent).toContain("Plan default 20,000 · Custom 30,000");
    expect(within(messages).getByRole("meter").className).toBe("usage-bar is-normal");
    const sequences = panel.querySelector('[data-limit="sequenceLimit"]') as HTMLElement;
    expect(within(sequences).getByText("Unlimited")).toBeTruthy();
    expect(within(sequences).queryByRole("meter")).toBeNull();
    expect(within(panel).queryByRole("textbox")).toBeNull();
  });

  it("colours a limit amber from 80% and red from 100%, and lists it as a problem", () => {
    render(<WorkspaceDetailScreen workspace={{ ...workspace, memberCount: 6 }} entitlement={{ ...entitlement, usage: { ...entitlement.usage, deliveriesReserved: 25000 } }} plans={plans} />);
    const panel = screen.getByRole("tabpanel", { name: "Overview" });
    expect(within(panel).getByRole("meter", { name: "Members used" }).className).toBe("usage-bar is-danger");
    expect(within(panel).getByRole("meter", { name: "Messages this month used" }).className).toBe("usage-bar is-warning");
    expect(within(panel).getByText("Over the limit for members: 6 of 5.")).toBeTruthy();
    expect(within(panel).getByText("Close to the limit for messages this month: 25,000 of 30,000.")).toBeTruthy();
  });

  it("saves plan and limits from the form with its own reason and the unchanged payload shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceDetailScreen workspace={workspace} entitlement={entitlement} plans={plans} />);
    const dialog = await openAction(/Change plan/);
    expect((within(dialog).getByRole("textbox", { name: "Messages this month" }) as HTMLInputElement).value).toBe("30000");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Reason/ }), "Support upgrade");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save plan and limits" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/workspaces/w1/entitlement", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ planId: "p1", overrides: { monthlyDeliveryLimit: 30000 }, version: 3 }) }));
    expect(decodeURIComponent(fetchMock.mock.calls[0][1].headers["x-admin-reason"])).toBe("Support upgrade");
    expect((await screen.findByRole("status")).textContent).toBe("Plan and limits saved.");
    vi.unstubAllGlobals();
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789abc" });
  });

  it("serialises blank, number, unlimited and feature choices to the API's overrides", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceDetailScreen workspace={workspace} entitlement={entitlement} plans={plans} />);
    const dialog = await openAction(/Change plan/);
    // fireEvent keeps this many-field test fast; typing is covered by the tests above.
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Messages this month" }), { target: { value: "" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Members" }), { target: { value: "12" } });
    const sequences = within(dialog).getByRole("textbox", { name: "Sequences" }).closest(".admin-limit-field") as HTMLElement;
    await userEvent.click(within(sequences).getByRole("checkbox", { name: "Unlimited" }));
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Data exports" }), "off");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Reason/ }), { target: { value: "Custom deal" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save plan and limits" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ planId: "p1", overrides: { memberLimit: 12, sequenceLimit: null, exportsEnabled: false }, version: 3 });
    vi.unstubAllGlobals();
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789abc" });
  });

  it("rejects a limit that is not a whole number next to the field, without saving", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceDetailScreen workspace={workspace} entitlement={entitlement} plans={plans} />);
    const dialog = await openAction(/Change plan/);
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Automations" }), "2.5");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Reason/ }), "Custom deal");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save plan and limits" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("Automations: enter a whole number");
    expect(document.activeElement).toBe(within(dialog).getByRole("textbox", { name: "Automations" }));
    expect(within(dialog).getByRole("textbox", { name: "Automations" }).getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789abc" });
  });

  it("locks lifecycle actions for a workspace queued for deletion", async () => {
    render(<WorkspaceDetailScreen workspace={{ ...workspace, status: "DELETION_PENDING" as const }} />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect((screen.getByRole("menuitem", { name: /Suspend workspace/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("menuitem", { name: /Resume paused automations/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Queued for permanent deletion/)).toBeTruthy();
  });

  it("offers reactivation instead of suspension for a suspended workspace", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceDetailScreen workspace={{ ...workspace, status: "SUSPENDED" as const, suspendedReason: "Spam" }} />);
    const dialog = await openAction("Reactivate workspace");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Reason/ }), "Appeal accepted");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reactivate workspace" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/workspaces/w1/lifecycle", expect.objectContaining({ body: JSON.stringify({ action: "RESTORE", version: 2 }) }));
    vi.unstubAllGlobals();
    vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789abc" });
  });

  it("shows this workspace's audit events on the Activity tab", () => {
    render(<WorkspaceDetailScreen workspace={workspace} initialTab="activity" activity={[{ id: "e1", phase: "FAILURE", actorEmail: "owner@linkar.test", action: "workspace.suspend", reason: "Spam", errorCode: "stale_version", createdAt: "2026-08-31T00:00:00Z" }]} />);
    const panel = screen.getByRole("tabpanel", { name: "Activity" });
    expect(within(panel).getByText("Suspended a workspace")).toBeTruthy();
    expect(within(panel).getByText("Failed")).toBeTruthy();
  });
});
