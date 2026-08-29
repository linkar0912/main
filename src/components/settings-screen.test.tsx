// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const { SettingsScreen } = await import("./settings-screen");

type Route = { data?: unknown; mode?: string };

function stubFetch(routes: Record<string, Route>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const match = Object.entries(routes).find(([path]) => url.endsWith(path) || url.includes(path + "?"));
      if (!match) {
        // Find the longest path the URL contains as a prefix, to disambiguate
        // `/api/facebook/connection` from `/api/facebook/connection/health`.
        const prefixMatch = Object.entries(routes)
          .filter(([path]) => url.startsWith(path) || url.includes(path + "/") || url.includes(path + "?"))
          .sort(([a], [b]) => b.length - a.length)[0];
        if (!prefixMatch) throw new Error(`Unexpected fetch to ${url}`);
        return { ok: true, json: async () => prefixMatch[1] } as unknown as Response;
      }
      return { ok: true, json: async () => match[1] } as unknown as Response;
    }),
  );
}

describe("SettingsScreen webhook health panel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/settings");
  });

  it("shows all-caught-up when every required field is subscribed", async () => {
    stubFetch({
      "/api/meta/connection/health": {
        data: [{
          id: "connection_1",
          username: "creator",
          status: "CONNECTED",
          requiredFields: ["comments", "messages", "messaging_postbacks", "messaging_optins", "messaging_referral"],
          subscribedFields: ["comments", "messages", "messaging_postbacks", "messaging_optins", "messaging_referral"],
          missingFields: [],
        }],
      },
      "/api/meta/connection": { data: [{ id: "connection_1", igUserId: "ig_1", username: "creator", status: "CONNECTED", connectedAt: "2026-08-21T00:00:00.000Z" }] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/health": { mode: "configured" },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText("All caught up")).toBeTruthy();
    expect(screen.queryByText(/Reconnect Instagram/)).toBeNull();
  });

  it("lists missing fields and prompts a reconnect when the subscription is incomplete", async () => {
    stubFetch({
      "/api/meta/connection/health": {
        data: [{
          id: "connection_1",
          username: "creator",
          status: "CONNECTED",
          requiredFields: ["comments", "messages", "messaging_postbacks", "messaging_optins", "messaging_referral"],
          subscribedFields: ["comments", "messages"],
          missingFields: ["messaging_postbacks", "messaging_optins", "messaging_referral"],
        }],
      },
      "/api/meta/connection": { data: [{ id: "connection_1", igUserId: "ig_1", username: "creator", status: "CONNECTED", connectedAt: "2026-08-21T00:00:00.000Z" }] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/health": { mode: "configured" },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText("Some fields need a reconnect")).toBeTruthy();
    expect(screen.getByText(/Reconnect Instagram/)).toBeTruthy();
    expect(screen.getByText("Quick-reply taps")).toBeTruthy();
  });

  it("does not render the panel when no Instagram account is connected", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/health": { mode: "demo" },
    });

    await act(async () => { render(<SettingsScreen />); });

    await screen.findByText("No account connected");
    expect(screen.queryByLabelText("Webhook health")).toBeNull();
  });

  it("explains when the Instagram account belongs to another workspace", async () => {
    window.history.replaceState({}, "", "/settings?meta=already-connected");
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/health": { mode: "configured" },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText(/already belongs to another Linkar workspace/)).toBeTruthy();
  });

  it("renders a Facebook Page card and a connect button when no Pages are linked", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": { data: [] },
      "/api/facebook/connection/health": { data: [] },
      "/api/health": { mode: "configured" },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText("No Page connected")).toBeTruthy();
    const connectLink = screen.getByRole("link", { name: /Connect Facebook Page/ });
    expect(connectLink.getAttribute("href")).toBe("/api/facebook/oauth/start");
  });

  it("lists connected Pages and offers a disconnect button", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": {
        data: [
          { id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" },
        ],
      },
      "/api/facebook/connection/health": { data: [{
        id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED",
        requiredFields: ["feed"], subscribedFields: ["feed"], missingFields: [],
      }] },
      "/api/health": { mode: "configured" },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText("Acme Co")).toBeTruthy();
    const disconnectButtons = screen.getAllByRole("button", { name: "Disconnect" });
    expect(disconnectButtons).toHaveLength(1);
  });

  it("shows a reconnect prompt when the Facebook health check reports missing fields", async () => {
    stubFetch({
      "/api/meta/connection/health": { data: [] },
      "/api/meta/connection": { data: [] },
      "/api/facebook/connection": {
        data: [
          { id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" },
        ],
      },
      "/api/facebook/connection/health": { data: [{
        id: "fb_rec_1", pageId: "12345", pageName: "Acme Co", status: "CONNECTED",
        requiredFields: ["feed"], subscribedFields: [], missingFields: ["feed"],
      }] },
      "/api/health": { mode: "configured" },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText("Some fields need a reconnect")).toBeTruthy();
    expect(screen.getByText(/Reconnect the Page/)).toBeTruthy();
  });
});
