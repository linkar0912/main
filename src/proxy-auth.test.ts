import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  createServerClient: vi.fn(),
  assertApplicationAccess: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/src/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/auth/session")>("@/src/lib/auth/session");
  return {
    ...actual,
    assertApplicationAccess: mocks.assertApplicationAccess,
  };
});

vi.mock("@/src/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

import { proxy } from "../proxy";

describe("proxy authentication boundaries", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.createServerClient.mockReset().mockReturnValue({ auth: { getClaims: mocks.getClaims } });
    mocks.assertApplicationAccess.mockReset();
    mocks.getServerEnv.mockReset().mockReturnValue({
      adminUrl: "https://admin.linkar.in",
      appUrl: "https://app.linkar.in",
      publicSiteUrl: "https://linkar.in",
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "publishable-key",
    });
  });

  it("lets an authenticated platform owner reach admin routes without workspace access", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "owner-user-id", email: "owner@example.com" } },
      error: null,
    });
    mocks.assertApplicationAccess.mockResolvedValue(null);

    const result = await proxy(new NextRequest("https://admin.linkar.in/admin"));

    expect(result.status).toBe(200);
    expect(result.headers.get("location")).toBeNull();
    expect(mocks.assertApplicationAccess).not.toHaveBeenCalled();
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "publishable-key",
      expect.objectContaining({ cookieOptions: { domain: "linkar.in", path: "/", httpOnly: true, secure: true, sameSite: "lax" } }),
    );
  });

  it("rejects cross-site state-changing API calls but lets same-origin and provider callbacks through", async () => {
    const crossSite = await proxy(new NextRequest("https://app.linkar.in/api/automations", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }));
    expect(crossSite.status).toBe(403);

    const sibling = await proxy(new NextRequest("https://app.linkar.in/api/broadcasts", { method: "POST", headers: { origin: "https://blog.linkar.in", "sec-fetch-site": "same-site" } }));
    expect(sibling.status).toBe(403);

    const sameOrigin = await proxy(new NextRequest("https://app.linkar.in/api/automations", { method: "POST", headers: { origin: "https://app.linkar.in", "sec-fetch-site": "same-origin" } }));
    expect(sameOrigin.status).toBe(200);

    const read = await proxy(new NextRequest("https://app.linkar.in/api/automations", { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }));
    expect(read.status).toBe(200);

    const webhook = await proxy(new NextRequest("https://app.linkar.in/api/razorpay/webhook", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }));
    expect(webhook.status).toBe(200);
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
});
