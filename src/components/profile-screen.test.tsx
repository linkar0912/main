// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/profile" }));

const { ProfileScreen } = await import("./profile-screen");

describe("ProfileScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("labels a workspace member with their real role", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/account")) {
        return {
          ok: true,
          json: async () => ({ data: { email: "collaborator@example.com", role: "MEMBER", plan: "free" } }),
        } as Response;
      }
      if (url.includes("/api/contacts")) {
        return { ok: true, json: async () => ({ data: { count: 0 } }) } as Response;
      }
      if (url.includes("/api/meta/connection")) {
        return { ok: true, json: async () => ({ data: [] }) } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    render(
      <ProfileScreen
        email="collaborator@example.com"
        memberSince="2026-08-20T00:00:00.000Z"
        emailVerified={true}
        role="MEMBER"
      />,
    );

    const summary = screen.getByLabelText("Profile summary");
    expect(within(summary).getByText("Member")).toBeTruthy();
    expect(within(summary).queryByText("Owner")).toBeNull();
  });
});
