// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789abc" });
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { WorkspaceDetailScreen } = await import("./workspace-detail-screen");
afterEach(cleanup);
const workspace = { id: "w1", name: "Acme", slug: "acme", status: "ACTIVE" as const, createdAt: "2026-08-31T00:00:00Z", updatedAt: "2026-08-31T00:00:00Z", version: 2, planKey: "growth", planName: "Growth", memberCount: 1, automationCount: 4, instagramConnectionCount: 1, facebookConnectionCount: 0, members: [{ userId: "u1", email: "owner@acme.test", role: "OWNER" }] };

describe("WorkspaceDetailScreen", () => {
  it("renders exact workspace, plan, member, tabs, and safe export controls", () => {
    render(<WorkspaceDetailScreen workspace={workspace} />);
    expect(screen.getByRole("heading", { name: "Acme", level: 1 })).toBeTruthy();
    expect(screen.getByText("Growth")).toBeTruthy();
    expect(screen.getByText("owner@acme.test")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Exports" }).getAttribute("href")).toBe("#exports");
    expect(screen.getByRole("link", { name: "Download CSV" }).getAttribute("href")).toBe("/api/admin/workspaces/w1/export?format=csv");
  });

  it("keeps a visible error until the exact suspension phrase is entered", async () => {
    render(<WorkspaceDetailScreen workspace={workspace} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Operator reason" }), "Abuse investigation");
    await userEvent.type(screen.getByRole("textbox", { name: /Type SUSPEND acme/ }), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Suspend workspace" }));
    expect(screen.getByRole("alert").textContent).toContain("Type SUSPEND acme exactly");
  });
});

const entitlement = { plan: { id: "p1", key: "growth", name: "Growth" }, defaults: {}, overrides: {}, effective: { memberLimit: 5, exportsEnabled: false, monthlyDeliveryLimit: null }, version: 3, usage: { deliveriesReserved: 0, broadcastsCreated: 0, periodStart: "2026-08-01T00:00:00Z" } };

describe("WorkspaceDetailScreen follow-up", () => {
  it("states empty member and connection lists", () => {
    render(<WorkspaceDetailScreen workspace={{ ...workspace, members: [] }} />);
    expect(screen.getByText("This workspace has no members.")).toBeTruthy();
    expect(screen.getByText("No provider connections.")).toBeTruthy();
  });

  it("saves an entitlement with its own reason and readable limits", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceDetailScreen workspace={workspace} entitlement={entitlement} plans={[{ id: "p1", key: "growth", name: "Growth", isActive: true }]} />);
    expect(screen.getByText("Member limit")).toBeTruthy();
    expect(screen.getByText("Unlimited")).toBeTruthy();
    expect(screen.getByText("Disabled")).toBeTruthy();
    // The save button no longer depends on the reason field of the lifecycle form further down.
    await userEvent.type(screen.getByRole("textbox", { name: "Reason for entitlement change" }), "Support upgrade");
    await userEvent.click(screen.getByRole("button", { name: "Save entitlement" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/workspaces/w1/entitlement", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ planId: "p1", overrides: {}, version: 3 }) }));
    expect(fetchMock.mock.calls[0][1].headers["x-admin-reason"]).toBe("Support upgrade");
    expect((await screen.findByRole("status")).textContent).toBe("Entitlement saved.");
    vi.unstubAllGlobals();
  });

  it("locks lifecycle controls for a workspace queued for deletion", () => {
    render(<WorkspaceDetailScreen workspace={{ ...workspace, status: "DELETION_PENDING" as const }} />);
    expect((screen.getByRole("button", { name: "Suspend workspace" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/queued for permanent deletion/)).toBeTruthy();
  });
});
