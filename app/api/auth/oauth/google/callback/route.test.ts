import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { createGoogleOAuthState, GOOGLE_OAUTH_STATE_COOKIE } from "@/src/lib/auth/google-oauth-state";
import { hashToken } from "@/src/lib/auth/tokens";

const SECRET = "test-secret-at-least-32-characters";
const OWNER_ID = "0b6f5f7e-6d1e-4c39-9d43-3a8f3e2b9a10";

const LOCAL_ENV = {
  appUrl: "http://localhost:3000",
  adminUrl: "http://localhost:3000",
  publicSiteUrl: "http://localhost:3000",
  authSessionSecret: SECRET,
  platformOwnerUserIds: [] as string[],
};

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  exchangeGoogleCode: vi.fn(),
  signInWithIdToken: vi.fn(),
  signOut: vi.fn(),
  findWorkspaceIdByMemberEmail: vi.fn(),
  findWorkspaceIdByMemberUserId: vi.fn(),
  bindMemberUserId: vi.fn(),
  findInvitationByTokenHash: vi.fn(),
  ensureWorkspace: vi.fn(),
  acceptInvitation: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => mocks.env,
}));
vi.mock("@/src/lib/auth/google-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/auth/google-oauth")>();
  return { ...actual, exchangeGoogleCode: mocks.exchangeGoogleCode };
});
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithIdToken: mocks.signInWithIdToken, signOut: mocks.signOut } }),
}));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    findWorkspaceIdByMemberEmail: mocks.findWorkspaceIdByMemberEmail,
    findWorkspaceIdByMemberUserId: mocks.findWorkspaceIdByMemberUserId,
    bindMemberUserId: mocks.bindMemberUserId,
    findInvitationByTokenHash: mocks.findInvitationByTokenHash,
    ensureWorkspace: mocks.ensureWorkspace,
    acceptInvitation: mocks.acceptInvitation,
  }),
}));
vi.mock("@/src/lib/id", () => ({ createId: (prefix: string) => `${prefix}_fixed` }));
vi.mock("@/src/lib/logger", () => ({ logger: { warn: mocks.loggerWarn, error: mocks.loggerError } }));

const { GET } = await import("./route");

function callbackRequest(query: string, cookieState?: string): NextRequest {
  return new NextRequest(`http://localhost/api/auth/oauth/google/callback${query}`, {
    headers: cookieState ? { cookie: `${GOOGLE_OAUTH_STATE_COOKIE}=${cookieState}` } : {},
  });
}

function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

function validState(params: { next: string; invite?: string } = { next: "/automations" }, now?: Date) {
  return createGoogleOAuthState(params, SECRET, now);
}

/** Whether the response writes the state cookie at all (here, only to delete it). */
function clearsStateCookie(response: Response): boolean {
  return response.headers.getSetCookie().some((line) => line.startsWith(`${GOOGLE_OAUTH_STATE_COOKIE}=;`));
}

function invitation(email: string) {
  return {
    id: "inv_1", workspaceId: "ws_invited", email, role: "MEMBER",
    tokenHash: "hash", invitedByUserId: "u_1",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  mocks.env = { ...LOCAL_ENV, platformOwnerUserIds: [] };
  mocks.exchangeGoogleCode.mockReset().mockResolvedValue({ idToken: "id-token-abc" });
  mocks.signInWithIdToken.mockReset().mockResolvedValue({ data: { user: { id: "user-google", email: "person@example.com" } }, error: null });
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
  mocks.findWorkspaceIdByMemberEmail.mockReset().mockResolvedValue(null);
  mocks.findWorkspaceIdByMemberUserId.mockReset().mockResolvedValue(null);
  mocks.bindMemberUserId.mockReset().mockResolvedValue(true);
  mocks.findInvitationByTokenHash.mockReset().mockResolvedValue(null);
  mocks.ensureWorkspace.mockReset();
  mocks.acceptInvitation.mockReset();
  mocks.loggerWarn.mockReset();
  mocks.loggerError.mockReset();
});

describe("GET /api/auth/oauth/google/callback", () => {
  it("redirects to login with error=oauth when there is no code", async () => {
    const { state } = validState();
    const response = await GET(callbackRequest(`?state=${state}`, state));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth&next=%2Fautomations");
    expect(mocks.exchangeGoogleCode).not.toHaveBeenCalled();
  });

  it("redirects to login with error=oauth when Google reports an error instead of a code", async () => {
    const response = await GET(callbackRequest("?error=server_error"));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
  });

  it("reports a cancelled consent screen and keeps next and invite from the verified state", async () => {
    const { state } = validState({ next: "/automations", invite: "raw-token" });
    const response = await GET(callbackRequest(`?error=access_denied&state=${state}`, state));
    expect(location(response)).toBe("http://localhost:3000/login?error=cancelled&next=%2Fautomations&invite=raw-token");
  });

  it("redirects to login with error=oauth when there is no state cookie, keeping next from the signed state", async () => {
    const { state } = validState();
    const response = await GET(callbackRequest(`?code=abc&state=${state}`));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth&next=%2Fautomations");
    expect(mocks.exchangeGoogleCode).not.toHaveBeenCalled();
  });

  it("redirects to login with error=oauth when the state param doesn't match the cookie", async () => {
    const { state } = validState();
    const response = await GET(callbackRequest(`?code=abc&state=${state}-tampered`, state));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
  });

  it("redirects to login with error=oauth when the state signature is invalid", async () => {
    const bogusState = "not-a-real-state";
    const response = await GET(callbackRequest(`?code=abc&state=${bogusState}`, bogusState));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
  });

  it("redirects to login with error=oauth when the Google code exchange fails, logging why", async () => {
    mocks.exchangeGoogleCode.mockRejectedValue(new Error("boom"));
    const { state } = validState();
    const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth&next=%2Fautomations");
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining("code exchange"),
      expect.objectContaining({ error: "boom" }),
    );
  });

  it("redirects to login with error=oauth when signInWithIdToken fails, logging only Supabase's status and code", async () => {
    mocks.signInWithIdToken.mockResolvedValue({ data: { user: null }, error: new AuthApiError("Unacceptable audience in id_token", 400, "bad_jwt") });
    const { state } = validState();
    const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth&next=%2Fautomations");
    expect(mocks.loggerError).toHaveBeenCalledWith(expect.stringContaining("signInWithIdToken"), { status: 400, code: "bad_jwt" });
  });

  it("passes the nonce embedded in the state to signInWithIdToken", async () => {
    const { state, nonce } = validState();
    await GET(callbackRequest(`?code=abc&state=${state}`, state));
    expect(mocks.signInWithIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google", token: "id-token-abc", nonce }),
    );
  });

  it("logs in (no provisioning) when the email already belongs to a workspace", async () => {
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("ws_existing");
    const { state } = validState({ next: "/automations" });
    const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
    expect(location(response)).toBe("http://localhost:3000/automations");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    expect(clearsStateCookie(response)).toBe(true);
  });

  it("redirects an owner-console sign-in to the admin origin", async () => {
    mocks.env = { ...LOCAL_ENV, appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in", publicSiteUrl: "https://linkar.in", platformOwnerUserIds: [] };
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("ws_existing");
    const { state } = validState({ next: "/admin/system" });
    const response = await GET(new NextRequest(`https://app.linkar.in/api/auth/oauth/google/callback?code=abc&state=${state}`, {
      headers: { cookie: `${GOOGLE_OAUTH_STATE_COOKIE}=${state}` },
    }));
    expect(location(response)).toBe("https://admin.linkar.in/admin/system");
  });

  it("accepts a valid invite for a first-time sign-in", async () => {
    mocks.findInvitationByTokenHash.mockResolvedValue(invitation("person@example.com"));
    const { state } = validState({ next: "/automations", invite: "raw-token" });
    const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
    expect(mocks.acceptInvitation).toHaveBeenCalledWith("inv_1", expect.any(String), "user-google");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
    expect(location(response)).toBe("http://localhost:3000/automations");
  });

  it("provisions a fresh workspace for a first-time sign-in with no invite", async () => {
    const { state } = validState({ next: "/automations" });
    const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
    expect(mocks.ensureWorkspace).toHaveBeenCalledWith("workspace_fixed", "person@example.com", "user-google");
    expect(location(response)).toBe("http://localhost:3000/automations");
  });

  it("answers a database failure while provisioning with a redirect, not an error page, and signs the session out", async () => {
    mocks.findWorkspaceIdByMemberUserId.mockRejectedValue(new Error("Timed out fetching a new connection from the connection pool."));
    const { state } = validState({ next: "/automations", invite: "raw-token" });
    const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
    expect(response.status).toBe(303);
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth-unavailable&next=%2Fautomations&invite=raw-token");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearsStateCookie(response)).toBe(true);
    expect(mocks.loggerError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: "Timed out fetching a new connection from the connection pool." }));
  });

  it("refuses an invitation sent to another address instead of giving the new account its own workspace", async () => {
    mocks.findInvitationByTokenHash.mockResolvedValue(invitation("work@company.com"));
    const { state } = validState({ next: "/automations", invite: "raw-token" });
    const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
    expect(location(response)).toBe("http://localhost:3000/login?error=invite-mismatch&next=%2Fautomations&invite=raw-token");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("accepts an invitation kept in the account's metadata by an earlier password signup", async () => {
    mocks.signInWithIdToken.mockResolvedValue({
      data: { user: { id: "user-google", email: "person@example.com", user_metadata: { pending_invite: "pending-token" } } },
      error: null,
    });
    mocks.findInvitationByTokenHash.mockResolvedValue(invitation("person@example.com"));
    const { state } = validState({ next: "/automations" });
    const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
    expect(mocks.findInvitationByTokenHash).toHaveBeenCalledWith(hashToken("pending-token"));
    expect(mocks.acceptInvitation).toHaveBeenCalledWith("inv_1", expect.any(String), "user-google");
    expect(location(response)).toBe("http://localhost:3000/automations");
  });

  it("does not refuse sign-in over a stale invitation in the metadata alone", async () => {
    mocks.signInWithIdToken.mockResolvedValue({
      data: { user: { id: "user-google", email: "person@example.com", user_metadata: { pending_invite: "expired-token" } } },
      error: null,
    });
    const { state } = validState({ next: "/automations" });
    const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
    expect(mocks.ensureWorkspace).toHaveBeenCalledWith("workspace_fixed", "person@example.com", "user-google");
    expect(location(response)).toBe("http://localhost:3000/automations");
  });

  it("takes a platform owner with no workspace straight to the owner console", async () => {
    mocks.env = { ...LOCAL_ENV, appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in", publicSiteUrl: "https://linkar.in", platformOwnerUserIds: [OWNER_ID] };
    mocks.signInWithIdToken.mockResolvedValue({ data: { user: { id: OWNER_ID.toUpperCase(), email: "owner@example.com" } }, error: null });
    const { state } = validState({ next: "/admin" });
    const response = await GET(new NextRequest(`https://app.linkar.in/api/auth/oauth/google/callback?code=abc&state=${state}`, {
      headers: { cookie: `${GOOGLE_OAUTH_STATE_COOKIE}=${state}` },
    }));
    expect(location(response)).toBe("https://admin.linkar.in/admin");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
    expect(mocks.findWorkspaceIdByMemberUserId).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  describe("the signed state on error redirects", () => {
    it("keeps next and invite from a state signed 11 minutes earlier when the cookie is gone", async () => {
      const { state } = validState({ next: "/automations", invite: "raw-token" }, new Date(Date.now() - 11 * 60 * 1_000));
      const response = await GET(callbackRequest(`?code=abc&state=${state}`));
      expect(location(response)).toBe("http://localhost:3000/login?error=oauth&next=%2Fautomations&invite=raw-token");
      expect(mocks.exchangeGoogleCode).not.toHaveBeenCalled();
    });

    it("keeps next and invite from an expired state, and clears the cookie it matches", async () => {
      const { state } = validState({ next: "/automations", invite: "raw-token" }, new Date(Date.now() - 45 * 60 * 1_000));
      const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
      expect(location(response)).toBe("http://localhost:3000/login?error=oauth&next=%2Fautomations&invite=raw-token");
      expect(mocks.exchangeGoogleCode).not.toHaveBeenCalled();
      expect(clearsStateCookie(response)).toBe(true);
    });

    it("leaves another tab's sign-in alone: tab A's stale callback does not clear tab B's cookie", async () => {
      const tabA = validState({ next: "/automations", invite: "raw-token" });
      const tabB = validState({ next: "/settings" });

      const staleA = await GET(callbackRequest(`?code=code-a&state=${tabA.state}`, tabB.state));
      expect(location(staleA)).toBe("http://localhost:3000/login?error=oauth&next=%2Fautomations&invite=raw-token");
      expect(clearsStateCookie(staleA)).toBe(false);
      expect(mocks.exchangeGoogleCode).not.toHaveBeenCalled();

      const cancelledA = await GET(callbackRequest(`?error=access_denied&state=${tabA.state}`, tabB.state));
      expect(clearsStateCookie(cancelledA)).toBe(false);

      mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("ws_existing");
      const finishedB = await GET(callbackRequest(`?code=code-b&state=${tabB.state}`, tabB.state));
      expect(mocks.exchangeGoogleCode).toHaveBeenCalledWith("code-b", expect.anything());
      expect(location(finishedB)).toBe("http://localhost:3000/settings");
      expect(clearsStateCookie(finishedB)).toBe(true);
    });
  });

  describe("Supabase's answer to signInWithIdToken", () => {
    const cases: Array<[string, unknown, string]> = [
      ["a network failure", new AuthRetryableFetchError("fetch failed", 0), "oauth-unavailable"],
      ["a 503", new AuthApiError("Service Unavailable", 503, undefined), "oauth-unavailable"],
      ["a 429", new AuthApiError("Too many requests", 429, undefined), "oauth-unavailable"],
      ["over_request_rate_limit", new AuthApiError("Request rate limit reached", 400, "over_request_rate_limit"), "oauth-unavailable"],
      ["provider_email_needs_verification", new AuthApiError("Unverified email with google", 400, "provider_email_needs_verification"), "oauth-confirm"],
      ["user_banned", new AuthApiError("User is banned", 400, "user_banned"), "oauth-blocked"],
      ["signup_disabled", new AuthApiError("Signups not allowed for this instance", 422, "signup_disabled"), "oauth-signup-disabled"],
      ["anything else", new AuthApiError("Bad ID token", 400, "bad_jwt"), "oauth"],
    ];
    for (const [name, error, code] of cases) {
      it(`answers ${name} with error=${code}`, async () => {
        mocks.signInWithIdToken.mockResolvedValue({ data: { user: null, session: null }, error });
        const { state } = validState({ next: "/automations", invite: "raw-token" });
        const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
        expect(location(response)).toBe(`http://localhost:3000/login?error=${code}&next=%2Fautomations&invite=raw-token`);
        const [, logged] = mocks.loggerError.mock.calls.find(([message]) => String(message).includes("signInWithIdToken")) ?? [];
        expect(Object.keys(logged ?? {}).sort()).toEqual(["code", "status"]);
        expect(JSON.stringify(logged)).not.toContain("id-token-abc");
      });
    }
  });
});
