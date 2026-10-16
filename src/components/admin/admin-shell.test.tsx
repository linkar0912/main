// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/admin", push: vi.fn(), assign: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useRouter: () => ({ push: navigation.push }) }));
// Marks every next/link anchor, so a test can tell it from a plain <a>.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode } & Record<string, unknown>) => {
    const anchorProps = Object.fromEntries(Object.entries(rest).filter(([key]) => !["prefetch", "scroll", "replace"].includes(key)));
    return <a data-next-link="" href={String(href)} {...anchorProps}>{children}</a>;
  },
}));

const { AdminShell } = await import("./admin-shell");

describe("AdminShell", () => {
  afterEach(() => {
    cleanup();
    navigation.pathname = "/admin";
    navigation.push.mockReset();
    window.localStorage.clear();
    document.body.style.overflow = "";
  });

  it("renders the exact operator navigation without customer workspace sections", () => {
    render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Overview</main></AdminShell>);

    expect(screen.getAllByText("Owner console").length).toBeGreaterThan(0);
    expect(screen.queryByText(/LINKAR OPERATOR/)).toBeNull();
    expect(screen.getByRole("link", { name: "Workspaces" }).getAttribute("href")).toBe("/admin/workspaces");
    expect(screen.getByRole("link", { name: "Back to workspace" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByRole("link", { name: "Broadcasts" })).toBeNull();
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
  });

  it("leaves the console for the workspace with a full page load, never a client fetch", () => {
    // /dashboard is on app.linkar.in. A next/link would prefetch or fetch it
    // from admin.linkar.in, follow the redirect and trip connect-src.
    render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Overview</main></AdminShell>);
    const sidebarLink = within(screen.getByLabelText("Operator sidebar")).getByRole("link", { name: "Back to workspace" });
    expect(sidebarLink.getAttribute("href")).toBe("/dashboard");
    expect(sidebarLink.hasAttribute("data-next-link")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Owner menu" }));
    const menuLink = within(document.getElementById("owner-menu") as HTMLElement).getByRole("menuitem", { name: "Back to workspace" });
    expect(menuLink.tagName).toBe("A");
    expect(menuLink.getAttribute("href")).toBe("/dashboard");
    expect(menuLink.hasAttribute("data-next-link")).toBe(false);

    // The console's own pages keep client navigation.
    expect(screen.getByRole("link", { name: "Workspaces" }).hasAttribute("data-next-link")).toBe(true);
  });

  it("opens the workspace from the palette with a full page load", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Overview</main></AdminShell>);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Back to workspace" } });
    fireEvent.click(screen.getByRole("option", { name: /Back to workspace/ }));
    expect(assign).toHaveBeenCalledWith("/dashboard");
    expect(navigation.push).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("uses exact active state for overview and prefix state for modules", () => {
    navigation.pathname = "/admin/workspaces/workspace-1";
    render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Workspace</main></AdminShell>);

    expect(screen.getByRole("link", { name: "Workspaces" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Overview" }).hasAttribute("aria-current")).toBe(false);
  });

  it("highlights Delete data on the Meta deletion requests page it links back to", () => {
    navigation.pathname = "/admin/system/data-deletions";
    render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Requests</main></AdminShell>);

    expect(screen.getByRole("link", { name: "Delete data" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Service health" }).hasAttribute("aria-current")).toBe(false);
  });

  it("searches workspaces and users from the owner console palette", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const items = url.startsWith("/api/admin/workspaces")
        ? [{ id: "ws1", name: "Acme Studio", slug: "acme-studio", planName: "Growth" }]
        : [{ id: "u1", email: "acme@example.com", workspaceCount: 2 }];
      return { ok: true, json: async () => ({ data: { items, nextCursor: null } }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Overview</main></AdminShell>);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = screen.getByRole("dialog", { name: "Search the owner console" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "acme" } });

    expect(await screen.findByRole("option", { name: /Acme Studio/ })).toBeTruthy();
    expect(await screen.findByRole("option", { name: /acme@example\.com/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/workspaces?search=acme&limit=5", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users?search=acme&limit=5", expect.anything());
    expect(dialog.textContent).not.toContain("Automations");
    vi.unstubAllGlobals();
  });

  it("moves the owner's identity and sign-out into the top bar menu", () => {
    render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Overview</main></AdminShell>);
    fireEvent.click(screen.getByRole("button", { name: "Owner menu" }));
    const menu = document.getElementById("owner-menu") as HTMLElement;
    expect(menu.textContent).toContain("owner@linkar.in");
    expect(menu.textContent).toContain("Owner console");
    const rows = Array.from(menu.querySelectorAll(".menu-item")).map((row) => row.textContent?.trim());
    expect(rows).toEqual(["Back to workspace", "Dark mode", "Sign out"]);
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Dark mode" })).toBeTruthy();
    // The button is the avatar alone.
    expect(screen.getByRole("button", { name: "Owner menu" }).textContent?.trim()).toBe("OW");
  });

  it("drives the owner menu from the keyboard (menu button pattern)", async () => {
    render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Overview</main></AdminShell>);
    const toggle = screen.getByRole("button", { name: "Owner menu" });
    expect(toggle.getAttribute("aria-haspopup")).toBe("menu");

    fireEvent.keyDown(toggle, { key: "ArrowUp" });
    const menu = screen.getByRole("menu", { name: "Owner menu" });
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Sign out" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Back to workspace" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "d" });
    expect(document.activeElement).toBe(within(menu).getByRole("menuitemcheckbox", { name: "Dark mode" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    await waitFor(() => expect(document.getElementById("owner-menu")).toBeNull());
    expect(document.activeElement).toBe(toggle);
  });

  it("closes the mobile operator drawer with Escape and restores focus", async () => {
    render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Overview</main></AdminShell>);
    const button = screen.getByRole("button", { name: "Open operator navigation" });
    fireEvent.click(button);

    const sidebar = screen.getByLabelText("Operator sidebar");
    expect(sidebar.getAttribute("data-open")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(sidebar.getAttribute("data-open")).toBe("false"));
    expect(document.activeElement).toBe(button);
  });
});
