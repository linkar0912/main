// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/help" }));

const { HelpScreen } = await import("./help-screen");

describe("HelpScreen search", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows only matching questions when a query matches one article", () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/account")) {
        return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
      }
      if (String(input).includes("/api/contacts")) {
        return { ok: true, json: async () => ({ data: { count: 0 } }) } as Response;
      }
      throw new Error(`Unexpected fetch to ${String(input)}`);
    }));
    render(<HelpScreen supportEmail="support@example.com" />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search help articles" }), { target: { value: "test before" } });

    expect(screen.getByText("Can I test before going live?")).toBeTruthy();
    expect(screen.queryByText("What is a follow gate?")).toBeNull();
  });

  it("falls back to the support email on the shell bootstrap when no prop is passed", async () => {
    // This is what lets /help be a static client page: the runtime SUPPORT_EMAIL
    // arrives on the bootstrap payload the sidebar already fetches, so the route
    // needs no force-dynamic server render of its own.
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/workspace/bootstrap")) {
        return {
          ok: true,
          json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free", supportEmail: "runtime@linkar.in" } }),
        } as Response;
      }
      throw new Error(`Unexpected fetch to ${String(input)}`);
    }));

    render(<HelpScreen />);

    const link = await screen.findByRole("link", { name: /runtime@linkar\.in/ });
    expect(link.getAttribute("href")).toBe("mailto:runtime@linkar.in");
  });

  it("documents Facebook Page public replies separately from Instagram DMs", () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/account")) {
        return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
      }
      if (String(input).includes("/api/contacts")) {
        return { ok: true, json: async () => ({ data: { count: 0 } }) } as Response;
      }
      throw new Error(`Unexpected fetch to ${String(input)}`);
    }));

    render(<HelpScreen supportEmail="support@example.com" />);

    expect(screen.getAllByText("Connecting Facebook Pages")).toHaveLength(2);
    fireEvent.click(screen.getByText("What can Facebook automations reply to?"));
    expect(screen.getByText(/public replies to top-level comments/i)).toBeTruthy();
    expect(screen.getByText(/Facebook does not use Instagram private-reply or DM actions/i)).toBeTruthy();
  });
});
