// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearWorkspaceDataCache, type FacebookPageSummary, type InstagramConnectionSummary } from "@/src/lib/client/workspace-data";
import { canConnectMore, SidebarAccountsSection, sidebarAccounts } from "./sidebar-accounts";

const instagram = (id: string, username: string, status: InstagramConnectionSummary["status"] = "CONNECTED"): InstagramConnectionSummary => ({
  id, igUserId: `ig_${id}`, username, status, connectedAt: "2026-09-01T10:00:00.000Z",
});
const facebook = (id: string, pageName: string, status: FacebookPageSummary["status"] = "CONNECTED"): FacebookPageSummary => ({
  id, pageId: `fb_${id}`, pageName, status, connectedAt: "2026-09-01T10:00:00.000Z",
});

function stubConnections(ig: InstagramConnectionSummary[], fb: FacebookPageSummary[]) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/meta/connection")) return { ok: true, json: async () => ({ data: ig }) } as Response;
    if (url.includes("/api/facebook/connection")) return { ok: true, json: async () => ({ data: fb }) } as Response;
    throw new Error(`Unexpected fetch to ${url}`);
  }));
}

describe("sidebar accounts", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearWorkspaceDataCache();
  });

  it("lists accounts that need a reconnect first, then the rest in channel order", () => {
    const accounts = sidebarAccounts([instagram("a", "studio"), instagram("b", "shop", "EXPIRED")], [facebook("c", "Studio Page", "DISCONNECTED")]);
    expect(accounts.map((account) => [account.name, account.tone])).toEqual([
      ["@shop", "danger"],
      ["Studio Page", "warning"],
      ["@studio", "ok"],
    ]);
  });

  it("offers another connection only while the plan has room", () => {
    expect(canConnectMore("free", 0, 0)).toBe(true);
    expect(canConnectMore("free", 1, 1)).toBe(false);
    expect(canConnectMore("unknown-plan", 1, 0)).toBe(true);
    expect(canConnectMore("agency", 9, 9)).toBe(true);
  });

  it("links each account to Settings → Connections focused on it, with a status the word carries", async () => {
    stubConnections([instagram("ig1", "studio.kavya"), instagram("ig2", "kavya.shop", "EXPIRED")], [facebook("fb1", "Studio Kavya")]);
    render(<SidebarAccountsSection plan="growth" onNavigate={() => undefined} />);

    const section = await screen.findByRole("region", { name: "Accounts" });
    const expired = await within(section).findByRole("link", { name: /@kavya\.shop/ });
    expect(expired.getAttribute("href")).toBe("/settings?account=ig2");
    expect(expired.textContent).toContain("expired - reconnect");
    expect(expired.querySelector(".sidebar-account-status")?.getAttribute("data-tone")).toBe("danger");
    expect(within(section).getByRole("link", { name: /Studio Kavya/ }).getAttribute("href")).toBe("/settings?account=fb1");
    expect(within(section).getByRole("link", { name: "Connect account" }).getAttribute("href")).toBe("/settings");
  });

  it("shows five and folds the rest behind Show all", async () => {
    stubConnections(Array.from({ length: 7 }, (_, index) => instagram(`ig${index}`, `account${index}`)), []);
    render(<SidebarAccountsSection plan="agency" onNavigate={() => undefined} />);

    const section = await screen.findByRole("region", { name: "Accounts" });
    await within(section).findByRole("link", { name: /@account0/ });
    expect(within(section).queryByRole("link", { name: /@account5/ })).toBeNull();
    const toggle = within(section).getByRole("button", { name: "Show all 7" });
    fireEvent.click(toggle);
    expect(within(section).getByRole("link", { name: /@account6/ })).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("hides Connect account when the plan is full", async () => {
    stubConnections([instagram("ig1", "studio")], [facebook("fb1", "Studio")]);
    render(<SidebarAccountsSection plan="free" onNavigate={() => undefined} />);

    const section = await screen.findByRole("region", { name: "Accounts" });
    await within(section).findByRole("link", { name: /@studio/ });
    expect(within(section).queryByRole("link", { name: "Connect account" })).toBeNull();
  });
});
