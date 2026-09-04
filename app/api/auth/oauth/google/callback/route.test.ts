import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createGoogleOAuthState, GOOGLE_OAUTH_STATE_COOKIE } from "@/src/lib/auth/google-oauth-state";

const SECRET = "test-secret-at-least-32-characters";

const mocks = vi.hoisted(() => ({
  exchangeGoogleCode: vi.fn(),
  signInWithIdToken: vi.fn(),
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
  getServerEnv: () => ({ appUrl: "http://localhost:3000", adminUrl: "http://localhost:3000", publicSiteUrl: "http://localhost:3000", authSessionSecret: SECRET }),
}));
vi.mock("@/src/lib/auth/google-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/auth/google-oauth")>();
  return { ...actual, exchangeGoogleCode: mocks.exchangeGoogleCode };
});
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithIdToken: mocks.signInWithIdToken } }),
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

function validState(params: { next: string; invite?: string } = { next: "/automations" }) {
  return createGoogleOAuthState(params, SECRET);
}

beforeEach(() => {
  mocks.exchangeGoogleCode.mockReset().mockResolvedValue({ idToken: "id-token-abc" });
  mocks.signInWithIdToken.mockReset().mockResolvedValue({ data: { user: { id: "user-google", email: "person@example.com" } }, error: null });
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
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
    expect(mocks.exchangeGoogleCode).not.toHaveBeenCalled();
  });

  it("redirects to login with error=oauth when Google reports an error instead of a code", async () => {
    const response = await GET(callbackRequest("?error=access_denied"));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
  });

  it("redirects to login with error=oauth when there is no state cookie", async () => {
    const { state } = validState();
    const response = await GET(callbackRequest(`?code=abc&state=${state}`));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
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
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining("code exchange"),
      expect.objectContaining({ error: "boom" }),
    );
  });

  it("redirects to login with error=oauth when signInWithIdToken fails, logging Supabase's error message", async () => {
    mocks.signInWithIdToken.mockResolvedValue({ data: { user: null }, error: { message: "Unacceptable audience in id_token" } });
    const { state } = validState();
    const response = await GET(callbackRequest(`?code=abc&state=${state}`, state));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining("signInWithIdToken"),
      expect.objectContaining({ error: "Unacceptable audience in id_token" }),
    );
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
  });

  it("redirects an owner-console sign-in to the admin origin", async () => {
    vi.resetModules();
    vi.doMock("@/src/lib/env", () => ({
      getServerEnv: () => ({
        appUrl: "https://app.linkar.in",
        adminUrl: "https://admin.linkar.in",
        publicSiteUrl: "https://linkar.in",
        authSessionSecret: SECRET,
      }),
    }));
    const { GET: GetProduction } = await import("./route");
    const { state } = validState({ next: "/admin/system" });
    const response = await GetProduction(new NextRequest(`https://app.linkar.in/api/auth/oauth/google/callback?code=abc&state=${state}`, {
      headers: { cookie: `${GOOGLE_OAUTH_STATE_COOKIE}=${state}` },
    }));
    expect(location(response)).toBe("https://admin.linkar.in/admin/system");
  });

  it("accepts a valid invite for a first-time sign-in", async () => {
    mocks.findInvitationByTokenHash.mockResolvedValue({
      id: "inv_1", workspaceId: "ws_invited", email: "person@example.com", role: "MEMBER",
      tokenHash: "hash", invitedByUserId: "u_1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(),
    });
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
});
