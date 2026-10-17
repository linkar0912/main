import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEntitlementService, EntitlementError } from "@/src/lib/entitlements/service";
import { createMemoryEntitlementRepository } from "@/src/lib/entitlements/memory-repository";
import { readOAuthState } from "@/src/lib/meta/oauth-state";

const mocks = vi.hoisted(() => ({
  checkValidatedSession: vi.fn(),
  listConnections: vi.fn(),
  assertEntitled: vi.fn(),
  getMemberRole: vi.fn(),
  /** Supabase's getClaims, for the test that runs the real session check. */
  getClaims: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: mocks.getClaims } }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("@/src/lib/auth/session", () => ({
  checkValidatedSession: mocks.checkValidatedSession,
  getValidatedSession: async (...args: unknown[]) => (await mocks.checkValidatedSession(...args)).session,
}));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ getMemberRole: mocks.getMemberRole, listConnections: mocks.listConnections }) }));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({
  appUrl: "https://app.linkar.in",
  metaAppId: "meta-app",
  authSessionSecret: "test-secret-at-least-32-characters",
  metaRedirectUri: "https://app.linkar.in/api/meta/oauth/callback",
  metaScopes: ["instagram_business_basic"],
  adminUrl: "https://admin.linkar.in",
  publicSiteUrl: "https://linkar.in",
  supabaseUrl: "https://example.supabase.co",
  supabasePublishableKey: "publishable-key",
}) }));

const { GET } = await import("./route");

const SESSION = { userId: "u1", email: "owner@example.com", workspaceId: "w1" };
const EXPIRED_ROW = { id: "ig_row_1", workspaceId: "w1", igUserId: "17841400000000001", username: "linkar", status: "EXPIRED" };

function start(query = "", cookie?: string): Request {
  return new Request(`https://app.linkar.in/api/meta/oauth/start${query}`, cookie ? { headers: { cookie } } : undefined);
}

/** The real Free plan rules: one Instagram account. */
function onFreePlan() {
  mocks.assertEntitled.mockImplementation(createEntitlementService(createMemoryEntitlementRepository()).assertEntitled);
}

function returnCookie(response: Response): string | undefined {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith("linkar_oauth_return="));
}

describe("GET /api/meta/oauth/start", () => {
  beforeEach(() => {
    mocks.checkValidatedSession.mockReset().mockResolvedValue({ session: SESSION, authUnavailable: false });
    mocks.listConnections.mockReset().mockResolvedValue([{ id: "ig1" }]);
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
    mocks.getMemberRole.mockReset().mockResolvedValue("OWNER");
  });

  it("sends a plain member back to Settings with a readable refusal", async () => {
    mocks.getMemberRole.mockResolvedValue("MEMBER");

    const response = await GET(start());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?meta=forbidden");
    expect(mocks.assertEntitled).not.toHaveBeenCalled();
  });

  it("lets Reconnect renew an account the workspace already has, even at the Free plan limit", async () => {
    onFreePlan();
    mocks.listConnections.mockResolvedValue([EXPIRED_ROW]);

    const response = await GET(start(`?reconnect=${EXPIRED_ROW.id}`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toMatch(/^https:\/\/www\.instagram\.com\/oauth\/authorize\?/);
    // The account being renewed is left out of the count; the callback
    // recounts once it knows which account came back.
    expect(mocks.assertEntitled).toHaveBeenCalledWith("w1", "instagram", 0);
  });

  it("still counts the workspace's other accounts for a Reconnect, before sending anyone to Instagram", async () => {
    // Over the limit (after a downgrade, say): the callback would refuse this
    // after Instagram's dialog, so the start refuses it first.
    onFreePlan();
    mocks.listConnections.mockResolvedValue([
      EXPIRED_ROW,
      { id: "ig_row_2", workspaceId: "w1", igUserId: "17841400000000002", username: "linkar.two", status: "CONNECTED" },
    ]);

    const response = await GET(start(`?reconnect=${EXPIRED_ROW.id}`));

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?meta=limit-reached");
  });

  it("still applies the limit when the Reconnect id is not one of this workspace's accounts", async () => {
    onFreePlan();
    mocks.listConnections.mockResolvedValue([EXPIRED_ROW]);

    const response = await GET(start("?reconnect=ig_row_from_another_workspace"));

    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?meta=limit-reached");
  });

  it("sends a refusal at the plan limit back as a banner, in Settings or in onboarding", async () => {
    onFreePlan();
    mocks.listConnections.mockResolvedValue([EXPIRED_ROW]);

    const fromSettings = await GET(start());
    expect(fromSettings.status).toBe(307);
    expect(fromSettings.headers.get("location")).toBe("https://app.linkar.in/settings?meta=limit-reached");

    const fromOnboarding = await GET(start("?return=onboarding"));
    expect(fromOnboarding.headers.get("location")).toBe("https://app.linkar.in/onboarding?meta=limit-reached");
  });

  it("maps a plan without the feature to plan-required, and a failed plan lookup to error", async () => {
    mocks.assertEntitled.mockRejectedValueOnce(new EntitlementError("entitlement_required", "instagram"));
    expect((await GET(start())).headers.get("location")).toBe("https://app.linkar.in/settings?meta=plan-required");

    mocks.assertEntitled.mockRejectedValueOnce(new Error("workspace_entitlement_missing"));
    expect((await GET(start())).headers.get("location")).toBe("https://app.linkar.in/settings?meta=error");

    mocks.listConnections.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await GET(start("?return=onboarding"))).headers.get("location")).toBe("https://app.linkar.in/onboarding?meta=error");
  });

  it("deletes a return cookie left by an abandoned onboarding connect when Settings starts one", async () => {
    const response = await GET(start("", "linkar_oauth_return=onboarding"));

    expect(response.headers.get("location")).toMatch(/^https:\/\/www\.instagram\.com\/oauth\/authorize\?/);
    const cookie = returnCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/^linkar_oauth_return=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });

  it("keeps setting the return cookie for a connect started in onboarding", async () => {
    const response = await GET(start("?return=onboarding"));

    expect(returnCookie(response)).toMatch(/^linkar_oauth_return=onboarding;/);
  });

  it("sends a signed-out person to sign in and back to where the connect started", async () => {
    mocks.checkValidatedSession.mockResolvedValue({ session: null, authUnavailable: false });

    expect((await GET(start())).headers.get("location")).toBe("https://app.linkar.in/login?next=%2Fsettings");
    expect((await GET(start("?return=onboarding"))).headers.get("location")).toBe("https://app.linkar.in/login?next=%2Fonboarding");
  });

  it("says Linkar is briefly unavailable instead of asking to sign in when Supabase Auth could not answer", async () => {
    mocks.checkValidatedSession.mockResolvedValue({ session: null, authUnavailable: true });

    expect((await GET(start())).headers.get("location")).toBe("https://app.linkar.in/settings?meta=unavailable");
    expect((await GET(start("?return=onboarding"))).headers.get("location")).toBe("https://app.linkar.in/onboarding?meta=unavailable");
    expect(mocks.getMemberRole).not.toHaveBeenCalled();
  });

  it("says Linkar is briefly unavailable when getClaims fails with a retryable error", async () => {
    // The real session check, so the route sees what an outage really looks like.
    const actual = await vi.importActual<typeof import("@/src/lib/auth/session")>("@/src/lib/auth/session");
    mocks.checkValidatedSession.mockImplementation(actual.checkValidatedSession);
    mocks.getClaims.mockReset().mockResolvedValue({ data: null, error: new AuthRetryableFetchError("Service Unavailable", 503) });

    const response = await GET(start());

    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?meta=unavailable");
    expect(mocks.getMemberRole).not.toHaveBeenCalled();
  });

  it("binds the state to the person who started the connect", async () => {
    const response = await GET(start());

    const state = response.headers.getSetCookie()
      .find((cookie) => cookie.startsWith("linkar_meta_oauth_state="))
      ?.split(";")[0]
      .slice("linkar_meta_oauth_state=".length);
    expect(state).toBeTruthy();
    expect(new URL(response.headers.get("location") ?? "").searchParams.get("state")).toBe(state);
    expect(readOAuthState(state ?? "", "test-secret-at-least-32-characters")).toEqual({ workspaceId: "w1", userId: "u1" });
  });
});
