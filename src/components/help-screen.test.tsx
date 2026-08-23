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
});
