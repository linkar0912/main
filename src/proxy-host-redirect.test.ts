import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  createServerClient: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

import { proxy } from "../proxy";

async function redirectOf(url: string, headers?: Record<string, string>) {
  const response = await proxy(new NextRequest(url, { headers }));
  return { status: response.status, location: response.headers.get("location") };
}

describe("proxy cross-host redirects", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset().mockResolvedValue({ data: null, error: new Error("signed out") });
    mocks.createServerClient.mockReset().mockReturnValue({ auth: { getClaims: mocks.getClaims } });
    mocks.getServerEnv.mockReset().mockReturnValue({
      adminUrl: "https://admin.linkar.in",
      appUrl: "https://app.linkar.in",
      publicSiteUrl: "https://linkar.in",
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "publishable-key",
    });
  });

  it("sends marketing pages on the app host to the marketing host with a permanent 308", async () => {
    for (const path of ["/pricing", "/features", "/features/instagram-comment-to-dm", "/solutions", "/templates/comment-guide-delivery", "/privacy", "/terms", "/support", "/contact"]) {
      expect(await redirectOf(`https://app.linkar.in${path}`), path).toEqual({ status: 308, location: `https://linkar.in${path}` });
    }
  });

  it("sends marketing pages on the admin host to the marketing host with a permanent 308", async () => {
    expect(await redirectOf("https://admin.linkar.in/pricing")).toEqual({ status: 308, location: "https://linkar.in/pricing" });
    expect(await redirectOf("https://admin.linkar.in/refund-policy")).toEqual({ status: 308, location: "https://linkar.in/refund-policy" });
  });

  it("keeps the query string and reads the public host from x-forwarded-host", async () => {
    expect(await redirectOf("https://app.linkar.in/pricing?interval=annual")).toEqual({
      status: 308,
      location: "https://linkar.in/pricing?interval=annual",
    });
    expect(await redirectOf("http://10.0.0.5:3000/pricing", { "x-forwarded-host": "app.linkar.in" })).toEqual({
      status: 308,
      location: "https://linkar.in/pricing",
    });
  });

  it("keeps the auth redirects to the app host temporary", async () => {
    expect(await redirectOf("https://linkar.in/login")).toEqual({ status: 307, location: "https://app.linkar.in/login" });
    expect(await redirectOf("https://linkar.in/signup?plan=creator")).toEqual({
      status: 307,
      location: "https://app.linkar.in/signup?plan=creator",
    });
    expect(await redirectOf("https://linkar.in/forgot-password")).toEqual({ status: 307, location: "https://app.linkar.in/forgot-password" });
    expect(await redirectOf("https://admin.linkar.in/signup")).toEqual({ status: 307, location: "https://app.linkar.in/signup" });
  });

  it("keeps app, owner console and bare-root redirects temporary", async () => {
    expect(await redirectOf("https://linkar.in/dashboard")).toEqual({ status: 307, location: "https://app.linkar.in/dashboard" });
    expect(await redirectOf("https://linkar.in/admin")).toEqual({ status: 307, location: "https://admin.linkar.in/admin" });
    expect(await redirectOf("https://app.linkar.in/admin/plans")).toEqual({ status: 307, location: "https://admin.linkar.in/admin/plans" });
    expect(await redirectOf("https://app.linkar.in/")).toEqual({ status: 307, location: "https://app.linkar.in/dashboard" });
    expect(await redirectOf("https://admin.linkar.in/")).toEqual({ status: 307, location: "https://admin.linkar.in/admin" });
  });

  it("serves marketing pages in place on the marketing host", async () => {
    for (const path of ["/", "/pricing", "/features/instagram-comment-to-dm"]) {
      const { status, location } = await redirectOf(`https://linkar.in${path}`);
      expect(status, path).toBe(200);
      expect(location, path).toBeNull();
    }
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
});
