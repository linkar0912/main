import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { FACEBOOK_SIGNIN_RETURN_COOKIE, setFacebookSignInReturn } from "@/src/lib/auth/facebook-signin-return";
import { hashToken } from "@/src/lib/auth/tokens";

const SECRET = "test-secret-at-least-32-characters";
const STORAGE_KEY = "sb-testref-auth-token";
const OWNER_ID = "0b6f5f7e-6d1e-4c39-9d43-3a8f3e2b9a10";

const LOCAL_ENV = {
  appUrl: "http://localhost:3000",
  adminUrl: "http://localhost:3000",
  publicSiteUrl: "http://localhost:3000",
  authSessionSecret: SECRET,
  supabaseUrl: "https://testref.supabase.co",
  platformOwnerUserIds: [] as string[],
};

const PRODUCTION_ENV = {
  ...LOCAL_ENV,
  appUrl: "https://app.linkar.in",
  adminUrl: "https://admin.linkar.in",
  publicSiteUrl: "https://linkar.in",
};

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  exchangeCodeForSession: vi.fn(),
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
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession, signOut: mocks.signOut } }),
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
vi.mock("@/src/lib/logger", () => ({ logger: { warn: mocks.loggerWarn, error: mocks.loggerError, info: vi.fn() } }));

const { GET } = await import("./route");

/** The Cookie header entry the Facebook start route leaves in the browser. */
function returnCookie(value: { next: string; invite?: string }, env = LOCAL_ENV): string {
  const setCookie = setFacebookSignInReturn(NextResponse.redirect("https://www.facebook.com/", 303), value, env).headers.get("set-cookie") ?? "";
  const match = new RegExp(`${FACEBOOK_SIGNIN_RETURN_COOKIE}=([^;]*)`).exec(setCookie);
  return `${FACEBOOK_SIGNIN_RETURN_COOKIE}=${match?.[1] ?? ""}`;
}

function callbackRequest(query: string, cookie?: string): Request {
  return new Request(`http://localhost/auth/oauth/callback${query}`, cookie ? { headers: { cookie } } : {});
}

function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

/** The Set-Cookie line that deletes `name`, if the response carries one. */
function deletionOf(response: Response, name: string): string | undefined {
  return setCookies(response).find((line) => line.startsWith(`${name}=;`) && line.includes("Max-Age=0"));
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
  mocks.exchangeCodeForSession.mockReset().mockResolvedValue({
    data: { user: { id: "user-oauth", email: "person@example.com" } },
    error: null,
  });
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

describe("GET /auth/oauth/callback", () => {
  it("redirects to login with error=oauth when there is no code", async () => {
    const response = await GET(callbackRequest("?next=/automations"));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth&next=%2Fautomations");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("tells the person they cancelled when the provider reports access_denied, keeping next and invite", async () => {
    const response = await GET(callbackRequest("?error=access_denied&next=/automations&invite=raw-token"));
    expect(location(response)).toBe("http://localhost:3000/login?error=cancelled&next=%2Fautomations&invite=raw-token");
  });

  it("redirects to login with error=oauth for any other provider error", async () => {
    const response = await GET(callbackRequest("?error=server_error&next=/automations"));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth&next=%2Fautomations");
  });

  it("redirects to login with error=oauth when the code exchange fails", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: "bad code" } });
    const response = await GET(callbackRequest("?code=abc&next=/automations&invite=raw-token"));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth&next=%2Fautomations&invite=raw-token");
  });

  it("logs in (no provisioning) when the email already belongs to a workspace", async () => {
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("ws_existing");
    const response = await GET(callbackRequest("?code=abc&next=/automations"));
    expect(location(response)).toBe("http://localhost:3000/automations");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it("redirects an owner-console sign-in to the admin origin", async () => {
    mocks.env = { ...PRODUCTION_ENV, platformOwnerUserIds: [] };
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("ws_existing");
    const response = await GET(new Request("https://app.linkar.in/auth/oauth/callback?code=abc&next=/admin/system"));
    expect(location(response)).toBe("https://admin.linkar.in/admin/system");
  });

  it("accepts a valid invite for a first-time OAuth sign-in", async () => {
    mocks.findInvitationByTokenHash.mockResolvedValue(invitation("person@example.com"));
    const response = await GET(callbackRequest("?code=abc&next=/automations&invite=raw-token"));
    expect(mocks.acceptInvitation).toHaveBeenCalledWith("inv_1", expect.any(String), "user-oauth");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
    expect(location(response)).toBe("http://localhost:3000/automations");
  });

  it("provisions a fresh workspace for a first-time OAuth sign-in with no invite", async () => {
    const response = await GET(callbackRequest("?code=abc&next=/automations"));
    expect(mocks.ensureWorkspace).toHaveBeenCalledWith("workspace_fixed", "person@example.com", "user-oauth");
    expect(location(response)).toBe("http://localhost:3000/automations");
  });

  describe("next and invite from the signed return cookie", () => {
    it("uses them for a successful sign-in and clears the cookie", async () => {
      mocks.findInvitationByTokenHash.mockResolvedValue(invitation("person@example.com"));
      const response = await GET(callbackRequest("?code=abc", returnCookie({ next: "/automations", invite: "tok" })));

      expect(mocks.findInvitationByTokenHash).toHaveBeenCalledWith(hashToken("tok"));
      expect(mocks.acceptInvitation).toHaveBeenCalledWith("inv_1", expect.any(String), "user-oauth");
      expect(location(response)).toBe("http://localhost:3000/automations");
      expect(deletionOf(response, FACEBOOK_SIGNIN_RETURN_COOKIE)).toBeDefined();
    });

    it("keeps them when the person cancels, and clears the cookie", async () => {
      const response = await GET(callbackRequest("?error=access_denied&error_description=Permissions+error", returnCookie({ next: "/automations", invite: "tok" })));
      expect(location(response)).toBe("http://localhost:3000/login?error=cancelled&next=%2Fautomations&invite=tok");
      expect(deletionOf(response, FACEBOOK_SIGNIN_RETURN_COOKIE)).toBeDefined();
    });

    it("keeps them when the code exchange fails", async () => {
      mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: "bad code" } });
      const response = await GET(callbackRequest("?code=abc", returnCookie({ next: "/automations", invite: "tok" })));
      expect(location(response)).toBe("http://localhost:3000/login?error=oauth&next=%2Fautomations&invite=tok");
      expect(deletionOf(response, FACEBOOK_SIGNIN_RETURN_COOKIE)).toBeDefined();
    });

    it("prefers the cookie over the query string, and ignores a cookie that does not verify", async () => {
      const preferred = await GET(callbackRequest("?error=access_denied&next=/settings", returnCookie({ next: "/automations" })));
      expect(location(preferred)).toBe("http://localhost:3000/login?error=cancelled&next=%2Fautomations");

      const forged = await GET(callbackRequest("?error=access_denied&next=/settings", `${FACEBOOK_SIGNIN_RETURN_COOKIE}=junk.value`));
      expect(location(forged)).toBe("http://localhost:3000/login?error=cancelled&next=%2Fsettings");
    });

    it("clears the cookie on the shared domain in production", async () => {
      mocks.env = { ...PRODUCTION_ENV, platformOwnerUserIds: [] };
      mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("ws_existing");
      const response = await GET(new Request("https://app.linkar.in/auth/oauth/callback?code=abc", {
        headers: { cookie: returnCookie({ next: "/automations" }, PRODUCTION_ENV) },
      }));
      expect(location(response)).toBe("https://app.linkar.in/automations");
      expect(deletionOf(response, FACEBOOK_SIGNIN_RETURN_COOKIE)).toContain("Domain=linkar.in");
    });
  });

  describe("Supabase's error codes", () => {
    it("says Facebook did not share the email address", async () => {
      const response = await GET(callbackRequest(
        "?error=server_error&error_code=unexpected_failure&error_description=Error+getting+user+email+from+external+provider",
        returnCookie({ next: "/automations", invite: "tok" }),
      ));
      expect(location(response)).toBe("http://localhost:3000/login?error=oauth-no-email&next=%2Fautomations&invite=tok");
    });

    it("does not call a banned account, a closed signup or an unconfirmed email a cancellation", async () => {
      const cases = [
        ["user_banned", "oauth-blocked"],
        ["signup_disabled", "oauth-signup-disabled"],
        ["provider_email_needs_verification", "oauth-confirm"],
      ] as const;
      for (const [code, error] of cases) {
        const response = await GET(callbackRequest(`?error=access_denied&error_code=${code}&error_description=x&next=/automations`));
        expect(location(response), code).toBe(`http://localhost:3000/login?error=${error}&next=%2Fautomations`);
      }
    });
  });

  it("signs out a session without an email address and says why", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "user-oauth", email: "" } }, error: null });
    const response = await GET(callbackRequest("?code=abc", returnCookie({ next: "/automations", invite: "tok" })));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth-no-email&next=%2Fautomations&invite=tok");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
  });

  it("answers a database failure while provisioning with a redirect, not an error page, and signs the session out", async () => {
    mocks.findWorkspaceIdByMemberUserId.mockRejectedValue(new Error("Timed out fetching a new connection from the connection pool."));
    const response = await GET(callbackRequest("?code=abc", returnCookie({ next: "/automations", invite: "tok" })));
    expect(response.status).toBe(303);
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth-unavailable&next=%2Fautomations&invite=tok");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.loggerError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: "Timed out fetching a new connection from the connection pool." }));
    expect(deletionOf(response, FACEBOOK_SIGNIN_RETURN_COOKIE)).toBeDefined();
  });

  it("refuses an invitation sent to another address instead of giving the new account its own workspace", async () => {
    mocks.findInvitationByTokenHash.mockResolvedValue(invitation("work@company.com"));
    const response = await GET(callbackRequest("?code=abc", returnCookie({ next: "/automations", invite: "tok" })));
    expect(location(response)).toBe("http://localhost:3000/login?error=invite-mismatch&next=%2Fautomations&invite=tok");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("refuses an unknown invite token for a new account", async () => {
    const response = await GET(callbackRequest("?code=abc&next=/automations&invite=bogus"));
    expect(location(response)).toBe("http://localhost:3000/login?error=invite-mismatch&next=%2Fautomations&invite=bogus");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
  });

  it("lets an existing member through whatever invite came along", async () => {
    mocks.findWorkspaceIdByMemberUserId.mockResolvedValue("ws_existing");
    mocks.findInvitationByTokenHash.mockResolvedValue(invitation("work@company.com"));
    const response = await GET(callbackRequest("?code=abc", returnCookie({ next: "/automations", invite: "tok" })));
    expect(location(response)).toBe("http://localhost:3000/automations");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("takes a platform owner with no workspace straight to the owner console", async () => {
    mocks.env = { ...PRODUCTION_ENV, platformOwnerUserIds: [OWNER_ID] };
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: OWNER_ID.toUpperCase(), email: "owner@example.com" } }, error: null });
    const response = await GET(new Request("https://app.linkar.in/auth/oauth/callback?code=abc", {
      headers: { cookie: returnCookie({ next: "/admin" }, PRODUCTION_ENV) },
    }));
    expect(location(response)).toBe("https://admin.linkar.in/admin");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
    expect(mocks.findWorkspaceIdByMemberUserId).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("still provisions a platform owner heading for the workspace app", async () => {
    mocks.env = { ...LOCAL_ENV, platformOwnerUserIds: [OWNER_ID] };
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: OWNER_ID, email: "owner@example.com" } }, error: null });
    const response = await GET(callbackRequest("?code=abc", returnCookie({ next: "/administrator" })));
    expect(location(response)).toBe("http://localhost:3000/administrator");
    expect(mocks.ensureWorkspace).toHaveBeenCalledWith("workspace_fixed", "owner@example.com", OWNER_ID);
  });

  describe("PKCE verifier cookies", () => {
    const verifiers = `${STORAGE_KEY}-code-verifier=v0; ${STORAGE_KEY}-flows-code-verifier=%5B%22abcdef0123456789%22%5D; ${STORAGE_KEY}-flow-abcdef0123456789-code-verifier=v1`;
    const names = [`${STORAGE_KEY}-code-verifier`, `${STORAGE_KEY}-flows-code-verifier`, `${STORAGE_KEY}-flow-abcdef0123456789-code-verifier`];

    it("deletes every verifier cookie the request carried once a code was exchanged", async () => {
      mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("ws_existing");
      const response = await GET(callbackRequest("?code=abc", `${verifiers}; ${STORAGE_KEY}=session; other=1`));
      for (const name of names) expect(deletionOf(response, name), name).toBeDefined();
      expect(deletionOf(response, STORAGE_KEY)).toBeUndefined();
      expect(deletionOf(response, "other")).toBeUndefined();
    });

    it("deletes them after a failed exchange too, since the code is spent either way", async () => {
      mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: "bad code" } });
      const response = await GET(callbackRequest("?code=abc", verifiers));
      for (const name of names) expect(deletionOf(response, name), name).toBeDefined();
    });

    it("deletes them on the shared domain in production", async () => {
      mocks.env = { ...PRODUCTION_ENV, platformOwnerUserIds: [] };
      mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("ws_existing");
      const response = await GET(new Request("https://app.linkar.in/auth/oauth/callback?code=abc", { headers: { cookie: verifiers } }));
      for (const name of names) {
        expect(deletionOf(response, name), name).toContain("Domain=linkar.in");
        expect(deletionOf(response, name), name).toContain("Path=/");
      }
    });

    it("leaves them alone on a callback without a code, so a stray callback cannot end a sign-in still in progress", async () => {
      const response = await GET(callbackRequest("?error=access_denied", verifiers));
      for (const name of names) expect(deletionOf(response, name), name).toBeUndefined();
    });
  });
});
