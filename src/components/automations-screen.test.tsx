// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/automations" }));

const { AutomationsScreen } = await import("./automations-screen");

describe("AutomationsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses the main workspace navigation without a duplicate automation sub-navigation", async () => {
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/workspace/bootstrap")) {
        return new Response(JSON.stringify({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }));
      }
      if (url === "/api/automations" || url.includes("/api/meta/connection") || url.includes("/api/facebook/connection")) {
        return new Response(JSON.stringify({ data: [] }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<AutomationsScreen />);

    expect(await screen.findByRole("heading", { name: "Automations" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Automation sections" })).toBeNull();
  });
});
