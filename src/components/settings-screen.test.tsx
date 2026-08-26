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
      const match = Object.entries(routes).find(([path]) => url.includes(path));
      if (!match) throw new Error(`Unexpected fetch to ${url}`);
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
      "/api/health": { mode: "configured" },
    });

    await act(async () => { render(<SettingsScreen />); });

    expect(await screen.findByText(/already belongs to another Linkar workspace/)).toBeTruthy();
  });
});
