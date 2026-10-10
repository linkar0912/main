// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const { ProfileScreen } = await import("./profile-screen");
const { AppShell } = await import("./app-shell");

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

    const identity = screen.getByRole("region", { name: "Profile identity" });
    expect(within(identity).getByText("Workspace role")).toBeTruthy();
    expect(within(identity).getByText("Current plan")).toBeTruthy();
    expect(within(identity).getByText("Email status")).toBeTruthy();
    expect(within(identity).getByText("Member")).toBeTruthy();
    expect(within(identity).queryByText("Owner")).toBeNull();
    expect(screen.getByRole("region", { name: "Connected channels" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Account actions" })).toBeTruthy();
    expect(document.querySelector(".profile-overview")).toBeNull();
  });

  it("reuses shell and connection data when Profile remounts", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/workspace/bootstrap")) return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
      if (url.includes("/api/meta/connection")) return { ok: true, json: async () => ({ data: [] }) } as Response;
      if (url.includes("/api/facebook/connection")) return { ok: true, json: async () => ({ data: [] }) } as Response;
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = render(<AppShell><ProfileScreen email="owner@example.com" memberSince="2026-08-20T00:00:00.000Z" emailVerified role="OWNER" /></AppShell>);
    await screen.findByText("No Instagram account connected yet.");
    first.unmount();
    render(<AppShell><ProfileScreen email="owner@example.com" memberSince="2026-08-20T00:00:00.000Z" emailVerified role="OWNER" /></AppShell>);
    await screen.findByText("No Instagram account connected yet.");

    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/workspace/bootstrap"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/meta/connection"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/facebook/connection"))).toHaveLength(1);
  });

  it("uses skeletons for identity facts that have not resolved", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<ProfileScreen email="owner@example.com" role="OWNER" />);

    const identity = screen.getByRole("region", { name: "Profile identity" });
    const joined = within(identity).getByText("Joined").closest("div");
    const verification = within(identity).getByText("Email status").closest("div");
    expect(joined?.querySelector(".skeleton-block")).toBeTruthy();
    expect(verification?.querySelector(".skeleton-block")).toBeTruthy();
    expect(within(identity).queryByText("Checking…")).toBeNull();
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

    const avatar = await screen.findByRole("img", { name: /@brand\.acct profile photo/i });
    expect(avatar.getAttribute("src")).toBe("https://cdn.instagram.com/dp.jpg");
    expect(avatar.closest(".social-avatar")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Instagram connected" })).toBeTruthy();
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
    expect(document.querySelector(".social-avatar.is-instagram .social-avatar-fallback")).toBeTruthy();
    expect(document.querySelector(".settings-avatar")).toBeNull();
  });

  it("shows a connected Facebook Page alongside Instagram channel management", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/account")) {
        return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
      }
      if (url.includes("/api/contacts")) {
        return { ok: true, json: async () => ({ data: { count: 0 } }) } as Response;
      }
      if (url.includes("/api/meta/connection")) {
        return { ok: true, json: async () => ({ data: [] }) } as Response;
      }
      if (url.includes("/api/facebook/connection")) {
        return { ok: true, json: async () => ({ data: [{ id: "fb_1", pageId: "page_1", pageName: "Linkar Page", status: "CONNECTED", connectedAt: "2026-08-30T00:00:00.000Z", avatarUrl: "/api/facebook/avatar?pageId=page_1&profileId=page_1" }] }) } as Response;
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

    expect(await screen.findByRole("heading", { name: "Connected channels" })).toBeTruthy();
    expect(screen.getByText("Linkar Page")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Linkar Page profile photo" })).toBeTruthy();
    expect(screen.getByText(/Facebook Page/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /manage channels/i }).getAttribute("href")).toBe("/settings");
  });

  it("lists every connected Instagram account and Facebook Page, not just the first", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/meta/connection")) {
        return { ok: true, json: async () => ({ data: [
          { id: "c1", igUserId: "ig_1", username: "studio_one", status: "CONNECTED", connectedAt: "2026-08-21T00:00:00.000Z" },
          { id: "c2", igUserId: "ig_2", username: "studio_two", status: "EXPIRED", connectedAt: "2026-08-22T00:00:00.000Z" },
        ] }) } as Response;
      }
      if (url.includes("/api/facebook/connection")) {
        return { ok: true, json: async () => ({ data: [
          { id: "fb_1", pageId: "page_1", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-30T00:00:00.000Z" },
          { id: "fb_2", pageId: "page_2", pageName: "Acme Studio", status: "CONNECTED", connectedAt: "2026-08-30T00:00:00.000Z" },
        ] }) } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }));

    render(<ProfileScreen email="owner@example.com" memberSince="2026-08-20T00:00:00.000Z" emailVerified={true} role="OWNER" />);

    const channels = await screen.findByRole("region", { name: "Connected channels" });
    expect(await within(channels).findByText("@studio_one")).toBeTruthy();
    expect(within(channels).getByText("@studio_two")).toBeTruthy();
    expect(within(channels).getByText("Acme Co")).toBeTruthy();
    expect(within(channels).getByText("Acme Studio")).toBeTruthy();
  });

  it("asks before signing out of every device", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }) as unknown as Response));
    render(<ProfileScreen email="owner@example.com" memberSince="2026-08-20T00:00:00.000Z" emailVerified={true} role="OWNER" />);

    const signOutAll = screen.getByRole("button", { name: /Sign out all/ });
    // The first click no longer submits the form.
    expect(signOutAll.getAttribute("type")).toBe("button");
    fireEvent.click(signOutAll);

    const confirm = screen.getByRole("group", { name: "Confirm signing out everywhere" });
    const submit = within(confirm).getByRole("button", { name: "Sign out everywhere" });
    expect(submit.getAttribute("type")).toBe("submit");
    expect(submit.closest("form")?.querySelector<HTMLInputElement>('input[name="action"]')?.value).toBe("logout-all");

    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Confirm signing out everywhere" })).toBeNull();
  });
});
