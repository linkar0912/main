// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const { AppShell } = await import("./app-shell");
const { notifyWorkspaceChanged } = await import("@/src/lib/client/workspace-data");

function stubShellFetch(role = "MEMBER", igAvatarUrl: string | null = null, platformOwner = false) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/workspace/bootstrap")) {
      return {
        ok: true,
        json: async () => ({ data: { email: "alex.rivera@example.com", role, plan: "free", igAvatarUrl, platformOwner } }),
      } as Response;
    }
    if (url.includes("/api/contacts")) {
      return { ok: true, json: async () => ({ data: { count: 3 } }) } as Response;
    }
    throw new Error(`Unexpected fetch to ${url}`);
  }));
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.style.overflow = "";
    navigation.pathname = "/dashboard";
  });

  it("resets workspace pages to the top after route changes", () => {
    stubShellFetch();
    const scrollTo = vi.mocked(window.scrollTo);

    const view = render(<AppShell><main>Dashboard</main></AppShell>);
    scrollTo.mockClear();

    navigation.pathname = "/settings";
    view.rerender(<AppShell><main>Settings</main></AppShell>);

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });

  it("shows the signed-in user's actual workspace role", async () => {
    stubShellFetch("MEMBER");

    render(<AppShell><main>Workspace</main></AppShell>);

    expect(await screen.findByText("Member")).toBeTruthy();
    expect(screen.queryByText("Owner")).toBeNull();
    // The identity chip is no longer a link - "My profile" is the one way in.
    expect(screen.getByRole("link", { name: "My profile" })).toBeTruthy();
    expect(screen.queryByTitle("Open my profile")).toBeNull();
  });

  it("renders the Linkar mark beside the wordmark in the sidebar", async () => {
    stubShellFetch();

    render(<AppShell><main>Workspace</main></AppShell>);

    await screen.findByText("Member");
    expect(document.querySelector(".sidebar-brand svg.brand-mark")).toBeTruthy();
    expect(screen.getAllByText("Linkar").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Linkar" }).getAttribute("href")).toBe("/dashboard");
  });

  it("shows the connected Instagram avatar on the identity card", async () => {
    stubShellFetch("OWNER", "https://cdn.instagram.com/dp.jpg");

    render(<AppShell><main>Workspace</main></AppShell>);

    const avatar = await screen.findByAltText("Instagram profile picture");
    expect(avatar.getAttribute("src")).toBe("https://cdn.instagram.com/dp.jpg");
  });

  it("keeps primary navigation focused on automations, insights, and quick setup", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);

    await screen.findByText("Member");
    const navigation = screen.getByRole("navigation", { name: "Workspace sections" });
    expect(within(navigation).getByRole("link", { name: "Quick automation" }).getAttribute("href")).toBe("/quick-automation");
    expect(within(navigation).getByRole("link", { name: "Insights" }).getAttribute("href")).toBe("/insights");
    expect(within(navigation).queryByRole("link", { name: "Sequences" })).toBeNull();
    expect(within(navigation).queryByRole("link", { name: "Broadcasts" })).toBeNull();
  });

  it("keeps pricing out of the account destinations", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);

    await screen.findByText("Member");
    const account = screen.getByRole("navigation", { name: "Account" });
    expect(within(account).queryByRole("link", { name: "Pricing" })).toBeNull();
  });

  it("keeps the signed-in footer compact without duplicate resource links", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);

    await screen.findByText("Member");
    expect(screen.queryByRole("navigation", { name: "Workspace resources" })).toBeNull();
    // The copyright footer was dropped: the sidebar account block is the only chrome.
    expect(document.querySelector(".app-footer")).toBeNull();
  });

  it("shows the operator-console link only to an allowlisted platform owner", async () => {
    stubShellFetch("OWNER", null, true);
    render(<AppShell><main>Workspace</main></AppShell>);

    expect(await screen.findByRole("link", { name: "Admin" })).toBeTruthy();

    cleanup();
    stubShellFetch("OWNER", null, false);
    render(<AppShell><main>Workspace</main></AppShell>);
    await screen.findByText("Owner");
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("closes the mobile drawer with Escape and restores page scrolling", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const sidebar = screen.getByLabelText("Workspace sidebar");
    expect(sidebar.getAttribute("data-open")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(sidebar);

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getByLabelText("Workspace sidebar").getAttribute("data-open")).toBe("false");
    });
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open navigation" }));
  });

  it("makes the page inert while open and restores focus when the scrim closes it", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);

    const menuButton = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(menuButton);

    const mainContent = document.querySelector(".main-content");
    expect(mainContent?.hasAttribute("inert")).toBe(true);
    fireEvent.click(document.querySelector(".scrim") as HTMLElement);

    await waitFor(() => expect(document.activeElement).toBe(menuButton));
    expect(mainContent?.hasAttribute("inert")).toBe(false);
  });

  it("gives the open drawer a visible close button of its own", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);

    const menuButton = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(menuButton);
    // The scrim is pointer-only; the labelled button is the one way out for keyboards.
    expect(screen.getAllByRole("button", { name: "Close navigation" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Workspace sidebar").getAttribute("data-open")).toBe("false");
    });
    expect(document.activeElement).toBe(menuButton);
    expect(screen.queryByRole("button", { name: "Close navigation" })).toBeNull();
  });

  it("gives page content one main landmark and a skip link to it", async () => {
    stubShellFetch();
    render(<AppShell><div>Workspace</div></AppShell>);

    const main = screen.getByRole("main");
    expect(main.id).toBe("main-content");
    expect(main.textContent).toContain("Workspace");
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip.getAttribute("href")).toBe("#main-content");
    // First in the tab order, ahead of the sidebar.
    expect(document.querySelector("a[href], button")).toBe(skip);
    await screen.findByText("Member");
  });

  it("uses a disclosure for the account menu and returns focus to its toggle on Escape", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);
    await screen.findByText("Member");

    const toggle = screen.getByRole("button", { name: "Account menu" });
    expect(toggle.hasAttribute("aria-haspopup")).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("account-menu");
    // No menu roles without the menu keyboard pattern behind them.
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
    expect(document.getElementById("account-menu")?.textContent).toContain("Sign out");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.getElementById("account-menu")).toBeNull());
    expect(document.activeElement).toBe(toggle);
  });

  it("re-reads the workspace identity when another screen reports a change", async () => {
    let plan = "free";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/workspace/bootstrap")) {
        return { ok: true, json: async () => ({ data: { email: "alex.rivera@example.com", role: "OWNER", plan, platformOwner: false } }) } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }));
    render(<AppShell><main>Workspace</main></AppShell>);
    expect(await screen.findByText("free")).toBeTruthy();

    plan = "growth";
    await act(async () => { notifyWorkspaceChanged(); });

    expect(await screen.findByText("growth")).toBeTruthy();
  });
});
