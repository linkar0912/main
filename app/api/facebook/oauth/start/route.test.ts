import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEntitlementService, EntitlementError } from "@/src/lib/entitlements/service";
import { createMemoryEntitlementRepository } from "@/src/lib/entitlements/memory-repository";
import { readOAuthState } from "@/src/lib/meta/oauth-state";

const mocks = vi.hoisted(() => ({
  checkValidatedSession: vi.fn(),
  listFacebookPages: vi.fn(),
  assertEntitled: vi.fn(),
  getMemberRole: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  checkValidatedSession: mocks.checkValidatedSession,
  getValidatedSession: async (...args: unknown[]) => (await mocks.checkValidatedSession(...args)).session,
}));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ getMemberRole: mocks.getMemberRole, listFacebookPages: mocks.listFacebookPages }) }));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({
  appUrl: "https://app.linkar.in",
  facebookAppId: "facebook-app",
  authSessionSecret: "test-secret-at-least-32-characters",
  facebookRedirectUri: "https://app.linkar.in/api/facebook/oauth/callback",
  facebookScopes: ["pages_manage_metadata"],
  facebookApiVersion: "v25.0",
}) }));

const { GET } = await import("./route");

const SESSION = { userId: "u1", email: "owner@example.com", workspaceId: "w1" };
const EXPIRED_PAGE_ROW = { id: "fb_row_1", workspaceId: "w1", pageId: "page_1", pageName: "Linkar Page", status: "EXPIRED" };
const FACEBOOK_DIALOG = /^https:\/\/www\.facebook\.com\/v25\.0\/dialog\/oauth\?/;

function start(query = "", cookie?: string): Request {
  return new Request(`https://app.linkar.in/api/facebook/oauth/start${query}`, cookie ? { headers: { cookie } } : undefined);
}

/** The real Free plan rules: Facebook on, one Page. */
function onFreePlan() {
  mocks.assertEntitled.mockImplementation(createEntitlementService(createMemoryEntitlementRepository()).assertEntitled);
}

function returnCookie(response: Response): string | undefined {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith("linkar_oauth_return="));
}

describe("GET /api/facebook/oauth/start", () => {
  beforeEach(() => {
    mocks.checkValidatedSession.mockReset().mockResolvedValue({ session: SESSION, authUnavailable: false });
    mocks.listFacebookPages.mockReset().mockResolvedValue([]);
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
    mocks.getMemberRole.mockReset().mockResolvedValue("OWNER");
  });

  it("sends a plan without Facebook back to Settings as a banner instead of raw JSON", async () => {
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("entitlement_required", "facebook"));

    const response = await GET(start());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=plan-required");
  });

  it("sends a plain member back with a readable refusal before building the Facebook dialog", async () => {
    mocks.getMemberRole.mockResolvedValue("MEMBER");

    const response = await GET(start());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.linkar.in/settings?facebook=forbidden");
    expect(mocks.getMemberRole).toHaveBeenCalledWith("w1", "owner@example.com");
    expect(mocks.assertEntitled).not.toHaveBeenCalled();

    mocks.getMemberRole.mockResolvedValue(null);
    expect((await GET(start("?return=onboarding"))).headers.get("location")).toBe("https://app.linkar.in/onboarding?facebook=forbidden");
  });

  it("lets Reconnect renew a Page the workspace already has, even at the Free plan limit", async () => {
    onFreePlan();
    mocks.listFacebookPages.mockResolvedValue([EXPIRED_PAGE_ROW]);

    const response = await GET(start(`?reconnect=${EXPIRED_PAGE_ROW.id}`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toMatch(FACEBOOK_DIALOG);
    // The Page being renewed is left out of the count, nothing more.
    expect(mocks.assertEntitled).toHaveBeenCalledWith("w1", "facebook", 0);
  });

  it("keeps the plan's Facebook switch, and the other Pages' count, for a Reconnect", async () => {
    mocks.assertEntitled.mockImplementation(
      createEntitlementService(createMemoryEntitlementRepository({ overrides: { facebookEnabled: false } })).assertEntitled,
    );
    mocks.listFacebookPages.mockResolvedValue([EXPIRED_PAGE_ROW]);

    expect((await GET(start(`?reconnect=${EXPIRED_PAGE_ROW.id}`))).headers.get("location"))
      .toBe("https://app.linkar.in/settings?facebook=plan-required");

    onFreePlan();
    mocks.listFacebookPages.mockResolvedValue([
      EXPIRED_PAGE_ROW,
      { id: "fb_row_2", workspaceId: "w1", pageId: "page_2", pageName: "Second Page", status: "CONNECTED" },
    ]);
    expect((await GET(start(`?reconnect=${EXPIRED_PAGE_ROW.id}`))).headers.get("location"))
      .toBe("https://app.linkar.in/settings?facebook=limit-reached");
  });

  it("sends a refusal at the plan limit back as a banner, in Settings or in onboarding", async () => {
    onFreePlan();
    mocks.listFacebookPages.mockResolvedValue([EXPIRED_PAGE_ROW]);

    expect((await GET(start())).headers.get("location")).toBe("https://app.linkar.in/settings?facebook=limit-reached");
    expect((await GET(start("?reconnect=fb_row_elsewhere"))).headers.get("location")).toBe("https://app.linkar.in/settings?facebook=limit-reached");
    expect((await GET(start("?return=onboarding"))).headers.get("location")).toBe("https://app.linkar.in/onboarding?facebook=limit-reached");
  });

  it("maps a failed plan lookup to error", async () => {
    mocks.assertEntitled.mockRejectedValueOnce(new Error("workspace_entitlement_missing"));
    expect((await GET(start())).headers.get("location")).toBe("https://app.linkar.in/settings?facebook=error");

    mocks.listFacebookPages.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await GET(start())).headers.get("location")).toBe("https://app.linkar.in/settings?facebook=error");
  });

  it("deletes a return cookie left by an abandoned onboarding connect when Settings starts one", async () => {
    const response = await GET(start("", "linkar_oauth_return=onboarding"));

    expect(response.headers.get("location")).toMatch(FACEBOOK_DIALOG);
    const cookie = returnCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/^linkar_oauth_return=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);

    expect(returnCookie(await GET(start("?return=onboarding")))).toMatch(/^linkar_oauth_return=onboarding;/);
  });

  it("sends a signed-out person to sign in and back to where the connect started", async () => {
    mocks.checkValidatedSession.mockResolvedValue({ session: null, authUnavailable: false });

    expect((await GET(start())).headers.get("location")).toBe("https://app.linkar.in/login?next=%2Fsettings");
    expect((await GET(start("?return=onboarding"))).headers.get("location")).toBe("https://app.linkar.in/login?next=%2Fonboarding");
  });

  it("says Linkar is briefly unavailable instead of asking to sign in when Supabase Auth could not answer", async () => {
    mocks.checkValidatedSession.mockResolvedValue({ session: null, authUnavailable: true });

    expect((await GET(start())).headers.get("location")).toBe("https://app.linkar.in/settings?facebook=unavailable");
    expect((await GET(start("?return=onboarding"))).headers.get("location")).toBe("https://app.linkar.in/onboarding?facebook=unavailable");
  });

  it("binds the state to the person who started the connect", async () => {
    const response = await GET(start());

    const state = response.headers.getSetCookie()
      .find((cookie) => cookie.startsWith("linkar_facebook_oauth_state="))
      ?.split(";")[0]
      .slice("linkar_facebook_oauth_state=".length);
    expect(state).toBeTruthy();
    expect(new URL(response.headers.get("location") ?? "").searchParams.get("state")).toBe(state);
    expect(readOAuthState(state ?? "", "test-secret-at-least-32-characters")).toEqual({ workspaceId: "w1", userId: "u1" });
  });
});
