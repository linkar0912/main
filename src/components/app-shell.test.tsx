// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useRouter: () => router }));

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
    if (url.includes("/api/meta/connection") || url.includes("/api/facebook/connection")) {
      return { ok: true, json: async () => ({ data: [] }) } as Response;
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

    // The account menu moved to the top bar; its head names the role.
    fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    expect(await screen.findByText("Member · Free plan")).toBeTruthy();
    expect(screen.queryByText(/^Owner/)).toBeNull();
    expect(screen.getByRole("menuitem", { name: "My profile" }).getAttribute("href")).toBe("/profile");
    expect(screen.queryByTitle("Open my profile")).toBeNull();
  });

  it("shows only the profile picture as the account button, with the plan in plain words inside", async () => {
    stubShellFetch("OWNER");
    render(<AppShell><main>Workspace</main></AppShell>);

    const account = await screen.findByRole("button", { name: "Account menu" });
    expect(account.closest("header")?.className).toContain("app-topbar");
    // Avatar only: no plan sticker, name or caret in the button.
    expect(account.querySelector(".plan-tag")).toBeNull();
    expect(account.querySelector("svg.lucide-chevron-down")).toBeNull();
    expect(account.textContent?.trim()).toMatch(/^.?$/);
    expect(account.querySelector(".avatar")).toBeTruthy();

    fireEvent.click(account);
    const menu = document.getElementById("account-menu") as HTMLElement;
    expect(menu.querySelector(".plan-tag")).toBeNull();
    expect(menu.textContent).toContain("Owner · Free plan");
    const rows = Array.from(menu.querySelectorAll(".menu-item")).map((row) => row.textContent?.trim());
    expect(rows).toEqual(["My profile", "Settings", "Billing", "Dark mode", "Help", "Sign out"]);
    expect(screen.getByRole("menuitem", { name: "Billing" }).getAttribute("href")).toBe("/settings?section=billing");
    const theme = screen.getByRole("menuitemcheckbox", { name: "Dark mode" });
    expect(theme.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(theme);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(theme.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(theme);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("opens the command palette from the search field, ⌘K, Ctrl K and /", async () => {
    stubShellFetch();
    render(<AppShell><main><input aria-label="Page field" /></main></AppShell>);
    await screen.findByRole("button", { name: "Account menu" });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("dialog", { name: "Search Linkar" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Search Linkar" })).toBeNull());

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Search Linkar" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Search Linkar" })).toBeNull());

    // "/" opens it, except while typing in a field.
    fireEvent.keyDown(screen.getByLabelText("Page field"), { key: "/" });
    expect(screen.queryByRole("dialog", { name: "Search Linkar" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByRole("dialog", { name: "Search Linkar" })).toBeTruthy();
  });

  it("finds pages from the palette and opens them with the keyboard", async () => {
    stubShellFetch();
    router.push.mockClear();
    render(<AppShell><main>Workspace</main></AppShell>);
    await screen.findByRole("button", { name: "Account menu" });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "billing" } });
    const first = screen.getAllByRole("option")[0];
    expect(first.textContent).toContain("Billing");
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(first.id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(router.push).toHaveBeenCalledWith("/settings?section=billing");
  });

  it("lists every way to create from the + menu", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);
    await screen.findByRole("button", { name: "Account menu" });

    fireEvent.click(screen.getByRole("button", { name: "More ways to create" }));
    const menu = document.getElementById("create-menu") as HTMLElement;
    expect(within(menu).getByRole("menuitem", { name: /^New automation/ }).getAttribute("href")).toBe("/automations/new");
    expect(within(menu).getByRole("menuitem", { name: /^Quick automation/ }).getAttribute("href")).toBe("/quick-automation");
    expect(within(menu).getByRole("menuitem", { name: /^From a template/ }).tagName).toBe("BUTTON");
    expect(within(menu).getByRole("menuitem", { name: /^New tracked link/ }).getAttribute("href")).toBe("/insights#tracked-links");
    expect(within(menu).getByRole("menuitem", { name: /^New broadcast/ }).getAttribute("href")).toBe("/automations/broadcasts#new-broadcast");
  });

  it("drives the + menu from the keyboard: arrows wrap, Home/End jump, letters jump, Tab closes", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);
    await screen.findByRole("button", { name: "Account menu" });

    const caret = screen.getByRole("button", { name: "More ways to create" });
    expect(caret.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.keyDown(caret, { key: "ArrowDown" });
    const menu = screen.getByRole("menu", { name: "More ways to create" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.every((item) => item.tabIndex === -1)).toBe(true);
    expect(document.activeElement).toBe(items[0]);
    const press = (key: string) => fireEvent.keyDown(document.activeElement as HTMLElement, { key });

    press("ArrowUp");
    expect(document.activeElement).toBe(items[items.length - 1]);
    press("ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    press("End");
    expect(document.activeElement).toBe(items[items.length - 1]);
    press("Home");
    press("ArrowDown");
    expect(document.activeElement).toBe(items[1]);
    press("f");
    expect(document.activeElement?.textContent).toMatch(/^From a template/);
    press("n");
    expect(document.activeElement?.textContent).toMatch(/^New tracked link/);
    press("Tab");
    await waitFor(() => expect(document.getElementById("create-menu")).toBeNull());
    expect(caret.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders the Linkar mark beside the wordmark in the sidebar", async () => {
    stubShellFetch();

    render(<AppShell><main>Workspace</main></AppShell>);

    await screen.findByRole("button", { name: "Account menu" });
    expect(document.querySelector(".sidebar-brand svg.brand-mark")).toBeTruthy();
    expect(screen.getAllByText("Linkar").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Linkar" }).getAttribute("href")).toBe("/dashboard");
  });

  it("shows the connected Instagram avatar on the identity card", async () => {
    stubShellFetch("OWNER", "https://cdn.instagram.com/dp.jpg");

    render(<AppShell><main>Workspace</main></AppShell>);

    // The picture is the whole account button (named "Account menu").
    const account = await screen.findByRole("button", { name: "Account menu" });
    expect(account.querySelector("img.avatar")?.getAttribute("src")).toBe("https://cdn.instagram.com/dp.jpg");
  });

  it("keeps primary navigation focused on automations, insights, and quick setup", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);

    await screen.findByRole("button", { name: "Account menu" });
    const navigation = screen.getByRole("navigation", { name: "Workspace sections" });
    expect(within(navigation).getByRole("link", { name: "Quick automation" }).getAttribute("href")).toBe("/quick-automation");
    expect(within(navigation).getByRole("link", { name: "Insights" }).getAttribute("href")).toBe("/insights");
    expect(within(navigation).queryByRole("link", { name: "Sequences" })).toBeNull();
    expect(within(navigation).queryByRole("link", { name: "Broadcasts" })).toBeNull();
  });

  it("keeps pricing out of the account destinations", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);

    await screen.findByRole("button", { name: "Account menu" });
    const account = screen.getByRole("navigation", { name: "Account" });
    expect(within(account).queryByRole("link", { name: "Pricing" })).toBeNull();
  });

  it("keeps the signed-in footer compact without duplicate resource links", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);

    await screen.findByRole("button", { name: "Account menu" });
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
    await screen.findByRole("button", { name: "Account menu" });
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
    await screen.findByRole("button", { name: "Account menu" });
  });

  it("follows the menu button pattern for the account menu and returns focus to its button on Escape", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);
    await screen.findByRole("button", { name: "Account menu" });

    const toggle = screen.getByRole("button", { name: "Account menu" });
    expect(toggle.getAttribute("aria-haspopup")).toBe("menu");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Enter and Space reach the button as a click: it opens on the first row.
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("account-menu");
    const menu = screen.getByRole("menu", { name: "Account menu" });
    expect(menu.id).toBe("account-menu");
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "My profile" }));
    const rows = [
      ...within(menu).getAllByRole("menuitem"),
      ...within(menu).getAllByRole("menuitemcheckbox"),
    ].map((row) => row.textContent?.trim());
    expect(rows.sort()).toEqual(["Billing", "Dark mode", "Help", "My profile", "Settings", "Sign out"]);

    const press = (key: string) => fireEvent.keyDown(document.activeElement as HTMLElement, { key });
    press("ArrowDown");
    press("ArrowDown");
    press("ArrowDown");
    expect(document.activeElement).toBe(within(menu).getByRole("menuitemcheckbox", { name: "Dark mode" }));
    press("s");
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Sign out" }));
    press("s");
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Settings" }));
    press("ArrowUp");
    press("ArrowUp");
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Sign out" }));

    press("Escape");
    await waitFor(() => expect(document.getElementById("account-menu")).toBeNull());
    expect(document.activeElement).toBe(toggle);

    // Arrow Up on the button opens on the last row.
    fireEvent.keyDown(toggle, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Sign out" }));
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
    fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    expect(await screen.findByText("Owner · Free plan")).toBeTruthy();

    plan = "growth";
    await act(async () => { notifyWorkspaceChanged(); });

    expect(await screen.findByText("Owner · Growth plan")).toBeTruthy();
  });

  it("sends someone who still needs onboarding there, and leaves everyone else alone", async () => {
    router.replace.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/workspace/bootstrap")) {
        return { ok: true, json: async () => ({ data: { email: "new.owner@example.com", role: "OWNER", plan: "free", onboarding: { required: true, flow: "owner", invite: false, planCard: false, goals: [], displayName: null } } }) } as Response;
      }
      return { ok: true, json: async () => ({ data: [] }) } as Response;
    }));
    render(<AppShell><p>Home content</p></AppShell>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/onboarding"));
    // The page underneath never flashes before the redirect lands.
    expect(screen.queryByText("Home content")).toBeNull();
  });

  it("does not redirect when the bootstrap carries no onboarding requirement", async () => {
    router.replace.mockClear();
    stubShellFetch("OWNER");
    render(<AppShell><p>Home content</p></AppShell>);
    await screen.findByRole("button", { name: "Account menu" });
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByText("Home content")).toBeTruthy();
  });
});
