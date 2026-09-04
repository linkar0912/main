// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const { AppShell } = await import("./app-shell");

function stubShellFetch(role = "MEMBER", igAvatarUrl: string | null = null, platformOwner = false) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/workspace/bootstrap")) {
      return {
        ok: true,
        json: async () => ({ data: { email: "member@example.com", role, plan: "free", igAvatarUrl, platformOwner } }),
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

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("shows the signed-in user's actual workspace role", async () => {
    stubShellFetch("MEMBER");

    render(<AppShell><main>Workspace</main></AppShell>);

    expect(await screen.findByText("Member")).toBeTruthy();
    expect(screen.queryByText("Owner")).toBeNull();
    // The identity chip is no longer a link - "My Profile" is the one way in.
    expect(screen.getByRole("link", { name: "My Profile" })).toBeTruthy();
    expect(screen.queryByTitle("Open my profile")).toBeNull();
  });

  it("renders only the Linkar wordmark in the sidebar, without the logo mark", async () => {
    stubShellFetch();

    render(<AppShell><main>Workspace</main></AppShell>);

    await screen.findByText("Member");
    expect(document.querySelector(".sidebar-brand .brand-mark")).toBeNull();
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
    expect(within(navigation).getByRole("link", { name: "Quick Automation" }).getAttribute("href")).toBe("/quick-automation");
    expect(within(navigation).getByRole("link", { name: "Insights" }).getAttribute("href")).toBe("/insights");
    expect(within(navigation).queryByRole("link", { name: "Sequences" })).toBeNull();
    expect(within(navigation).queryByRole("link", { name: "Broadcasts" })).toBeNull();
  });

  it("keeps pricing discoverable with the account destinations", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);

    await screen.findByText("Member");
    const account = screen.getByRole("navigation", { name: "Account" });
    expect(within(account).getByRole("link", { name: "Pricing" }).getAttribute("href")).toBe("/pricing");
  });

  it("exposes every public support and policy destination from workspace pages", async () => {
    stubShellFetch();
    render(<AppShell><main>Workspace</main></AppShell>);

    const resources = screen.getByRole("navigation", { name: "Workspace resources" });
    const expectedLinks = [
      ["Support", "/support"],
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
      ["Cookies", "/cookies"],
      ["Acceptable use", "/acceptable-use"],
      ["Data processing", "/data-processing"],
      ["Service providers", "/service-providers"],
      ["Data deletion", "/data-deletion"],
    ];

    for (const [name, href] of expectedLinks) {
      expect(within(resources).getByRole("link", { name }).getAttribute("href")).toBe(href);
    }
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
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));

    await waitFor(() => expect(document.activeElement).toBe(menuButton));
    expect(mainContent?.hasAttribute("inert")).toBe(false);
  });
});
