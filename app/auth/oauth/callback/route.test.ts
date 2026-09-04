import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  findWorkspaceIdByMemberEmail: vi.fn(),
  findWorkspaceIdByMemberUserId: vi.fn(),
  bindMemberUserId: vi.fn(),
  findInvitationByTokenHash: vi.fn(),
  ensureWorkspace: vi.fn(),
  acceptInvitation: vi.fn(),
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ appUrl: "http://localhost:3000", adminUrl: "http://localhost:3000" }),
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession } }),
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

const { GET } = await import("./route");

function callbackRequest(query: string): Request {
  return new Request(`http://localhost/auth/oauth/callback${query}`);
}

function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

beforeEach(() => {
  mocks.exchangeCodeForSession.mockReset().mockResolvedValue({
    data: { user: { id: "user-oauth", email: "person@example.com" } },
    error: null,
  });
  mocks.findWorkspaceIdByMemberEmail.mockReset().mockResolvedValue(null);
  mocks.findWorkspaceIdByMemberUserId.mockReset().mockResolvedValue(null);
  mocks.bindMemberUserId.mockReset().mockResolvedValue(true);
  mocks.findInvitationByTokenHash.mockReset().mockResolvedValue(null);
  mocks.ensureWorkspace.mockReset();
  mocks.acceptInvitation.mockReset();
});

describe("GET /auth/oauth/callback", () => {
  it("redirects to login with error=oauth when there is no code", async () => {
    const response = await GET(callbackRequest("?next=/automations"));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to login with error=oauth when the provider reports an error instead of a code", async () => {
    const response = await GET(callbackRequest("?error=access_denied&next=/automations"));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
  });

  it("redirects to login with error=oauth when the code exchange fails", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: "bad code" } });
    const response = await GET(callbackRequest("?code=abc&next=/automations"));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
  });

  it("logs in (no provisioning) when the email already belongs to a workspace", async () => {
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("ws_existing");
    const response = await GET(callbackRequest("?code=abc&next=/automations"));
    expect(location(response)).toBe("http://localhost:3000/automations");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it("redirects an owner-console sign-in to the admin origin", async () => {
    vi.resetModules();
    vi.doMock("@/src/lib/env", () => ({
      getServerEnv: () => ({ appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in" }),
    }));
    const { GET: GetProduction } = await import("./route");
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("ws_existing");
    const response = await GetProduction(new Request("https://app.linkar.in/auth/oauth/callback?code=abc&next=/admin/system"));
    expect(location(response)).toBe("https://admin.linkar.in/admin/system");
  });

  it("accepts a valid invite for a first-time OAuth sign-in", async () => {
    mocks.findInvitationByTokenHash.mockResolvedValue({
      id: "inv_1", workspaceId: "ws_invited", email: "person@example.com", role: "MEMBER",
      tokenHash: "hash", invitedByUserId: "u_1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(),
    });
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

  it("falls back to a fresh workspace when the invite token is invalid, rather than blocking sign-in", async () => {
    mocks.findInvitationByTokenHash.mockResolvedValue(null);
    const response = await GET(callbackRequest("?code=abc&next=/automations&invite=bogus"));
    expect(mocks.ensureWorkspace).toHaveBeenCalledWith("workspace_fixed", "person@example.com", "user-oauth");
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    expect(location(response)).toBe("http://localhost:3000/automations");
  });
});
