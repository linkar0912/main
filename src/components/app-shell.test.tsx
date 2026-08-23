// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { AppShell } = await import("./app-shell");

function stubShellFetch(role = "MEMBER") {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/account")) {
      return {
        ok: true,
        json: async () => ({ data: { email: "member@example.com", role, plan: "free" } }),
      } as Response;
    }
    if (url.includes("/api/contacts")) {
      return { ok: true, json: async () => ({ data: { count: 3 } }) } as Response;
    }
    throw new Error(`Unexpected fetch to ${url}`);
  }));
}

describe("AppShell", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.style.overflow = "";
  });

  it("shows the signed-in user's actual workspace role", async () => {
    stubShellFetch("MEMBER");

    render(<AppShell><main>Workspace</main></AppShell>);

    expect(await screen.findByText("Member")).toBeTruthy();
    expect(screen.queryByText("Owner")).toBeNull();
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
