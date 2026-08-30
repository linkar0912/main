// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const { AdminShell } = await import("./admin-shell");

describe("AdminShell", () => {
  afterEach(() => {
    cleanup();
    navigation.pathname = "/admin";
    document.body.style.overflow = "";
  });

  it("renders the exact operator navigation without customer workspace sections", () => {
    render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Overview</main></AdminShell>);

    expect(screen.getAllByText("LINKAR OPERATOR").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Workspaces" }).getAttribute("href")).toBe("/admin/workspaces");
    expect(screen.getByRole("link", { name: "Back to workspace" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByRole("link", { name: "Broadcasts" })).toBeNull();
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
  });

  it("uses exact active state for overview and prefix state for modules", () => {
    navigation.pathname = "/admin/workspaces/workspace-1";
    render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Workspace</main></AdminShell>);

    expect(screen.getByRole("link", { name: "Workspaces" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Overview" }).hasAttribute("aria-current")).toBe(false);
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
