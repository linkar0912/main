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
  });
});
