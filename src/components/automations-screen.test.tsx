// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/automations", useRouter: () => ({ push: vi.fn() }) }));

const { AutomationsScreen } = await import("./automations-screen");
const { AutomationSectionsShell } = await import("./automation-sections-shell");
const { clearAutomationsCache } = await import("./automation-list");

describe("AutomationsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearAutomationsCache();
  });

  it("links My Automations, Sequences and Broadcasts as tabs under the header", async () => {
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

    render(<AutomationSectionsShell><AutomationsScreen /></AutomationSectionsShell>);

    expect(await screen.findByRole("heading", { name: "Automations" })).toBeTruthy();
    const tabs = screen.getByRole("navigation", { name: "Automation sections" });
    expect(within(tabs).getByRole("link", { name: "My Automations" }).getAttribute("aria-current")).toBe("page");
    expect(within(tabs).getByRole("link", { name: "Sequences" }).getAttribute("href")).toBe("/automations/sequences");
    expect(within(tabs).getByRole("link", { name: "Broadcasts" }).getAttribute("href")).toBe("/automations/broadcasts");
  });

  it("shows a useful message when the automations endpoint returns an empty error response", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/workspace/bootstrap")) {
        return new Response(JSON.stringify({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }));
      }
      if (url === "/api/automations") return new Response(null, { status: 502 });
      if (url.includes("/api/meta/connection") || url.includes("/api/facebook/connection")) {
        return new Response(JSON.stringify({ data: [] }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<AutomationSectionsShell><AutomationsScreen /></AutomationSectionsShell>);

    expect((await screen.findByRole("alert")).textContent).toBe("Could not load automations");
  });
});
