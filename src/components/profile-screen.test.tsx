// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

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

    const summary = screen.getByLabelText("Account summary");
    expect(within(summary).getByText("Member")).toBeTruthy();
    expect(within(summary).queryByText("Owner")).toBeNull();
  });

  it("shows the connected Instagram account's profile picture", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/account")) {
        return {
          ok: true,
          json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }),
        } as Response;
      }
      if (url.includes("/api/contacts")) {
        return { ok: true, json: async () => ({ data: { count: 0 } }) } as Response;
      }
      if (url.includes("/api/meta/connection")) {
        return {
          ok: true,
          json: async () => ({
            data: [{
              id: "conn_1",
              igUserId: "ig_1",
              username: "brand.acct",
              status: "CONNECTED",
              connectedAt: "2026-08-20T00:00:00.000Z",
              profilePictureUrl: "https://cdn.instagram.com/dp.jpg",
            }],
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    render(
      <ProfileScreen
        email="owner@example.com"
        memberSince="2026-08-20T00:00:00.000Z"
        emailVerified={true}
        role="OWNER"
      />,
    );

    const avatar = await screen.findByRole("img", { name: /@brand\.acct profile picture/i });
    expect(avatar.getAttribute("src")).toBe("https://cdn.instagram.com/dp.jpg");
    expect(avatar.className).toContain("avatar-connection");
  });

  it("falls back to the glyph when Meta provides no profile picture", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/account")) {
        return {
          ok: true,
          json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }),
        } as Response;
      }
      if (url.includes("/api/contacts")) {
        return { ok: true, json: async () => ({ data: { count: 0 } }) } as Response;
      }
      if (url.includes("/api/meta/connection")) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: "conn_1", igUserId: "ig_1", username: "brand.acct", status: "CONNECTED", connectedAt: "2026-08-20T00:00:00.000Z" }],
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    render(
      <ProfileScreen
        email="owner@example.com"
        memberSince="2026-08-20T00:00:00.000Z"
        emailVerified={true}
        role="OWNER"
      />,
    );

    expect(await screen.findByText(/@brand\.acct/)).toBeTruthy();
    // The connection card falls back to a glyph avatar, never a broken image.
    expect(document.querySelector(".avatar-connection")).toBeTruthy();
    expect(document.querySelector(".settings-avatar")).toBeNull();
  });
});
