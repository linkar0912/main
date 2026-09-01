// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/help" }));

const { HelpScreen } = await import("./help-screen");

describe("HelpScreen search", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/help");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps only the compact search field instead of the duplicate help hero", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 })));
    render(<HelpScreen supportEmail="support@example.com" />);

    expect(screen.queryByText("How can we help?")).toBeNull();
    expect(screen.queryByText(/Browse 52 short guides/)).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search help articles" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run search" })).toBeNull();
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

  it("finds a guide when the query appears only in its answer", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 })));
    render(<HelpScreen supportEmail="support@example.com" />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search help articles" }), {
      target: { value: "suppressed workspace-wide" },
    });

    expect(screen.getByText("How does opting out work?")).toBeTruthy();
    expect(screen.queryByText("What is a follow gate?")).toBeNull();
  });

  it("opens the requested topic from a contextual-help URL", async () => {
    window.history.replaceState({}, "", "/help?topic=sequences");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 })));
    render(<HelpScreen supportEmail="support@example.com" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Sequences & broadcasts" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Getting started" })).toBeNull();
  });

  it("records a no-result search once after typing pauses", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<HelpScreen supportEmail="support@example.com" />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search help articles" }), {
      target: { value: "definitely absent phrase" },
    });
    await vi.advanceTimersByTimeAsync(800);

    const analyticsCalls = fetchMock.mock.calls.filter(([input]) => String(input) === "/api/help/analytics");
    expect(analyticsCalls).toHaveLength(1);
    expect(JSON.parse(String((analyticsCalls[0][1] as RequestInit).body))).toEqual({
      kind: "search",
      query: "definitely absent phrase",
      resultCount: 0,
    });
  });

  it("submits helpful feedback for an opened guide", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<HelpScreen supportEmail="support@example.com" />);

    fireEvent.click(screen.getByText("What is Linkar?"));
    fireEvent.click(screen.getByRole("button", { name: "Yes, this was helpful" }));

    await waitFor(() => expect(screen.getByText("Thanks for the feedback.")).toBeTruthy());
    const analyticsCall = fetchMock.mock.calls.find(([input, init]) => (
      String(input) === "/api/help/analytics" && String((init as RequestInit | undefined)?.body).includes("feedback")
    ));
    expect(analyticsCall).toBeTruthy();
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
