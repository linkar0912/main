import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  findWorkspaceIdByMemberEmail: vi.fn(),
  listWorkspaceMembershipsByUserId: vi.fn(),
  bindMemberUserId: vi.fn(),
  getApplicationAccessState: vi.fn(),
}));

vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    findWorkspaceIdByMemberEmail: mocks.findWorkspaceIdByMemberEmail,
    listWorkspaceMembershipsByUserId: mocks.listWorkspaceMembershipsByUserId,
    bindMemberUserId: mocks.bindMemberUserId,
    getApplicationAccessState: mocks.getApplicationAccessState,
  }),
}));

const { getValidatedSession, safeNextPath } = await import("./session");

describe("getValidatedSession", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.findWorkspaceIdByMemberEmail.mockReset();
    mocks.listWorkspaceMembershipsByUserId.mockReset().mockResolvedValue([{ workspaceId: "workspace_1", email: "member@example.com" }]);
    mocks.bindMemberUserId.mockReset().mockResolvedValue(true);
    mocks.getApplicationAccessState.mockReset().mockResolvedValue({
      userStatus: "ACTIVE",
      workspaceStatus: "ACTIVE",
      sessionInvalidBefore: null,
    });
  });

  it("resolves a verified session to userId/email/workspaceId", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "member@example.com", iat: 1_788_172_800 } },
      error: null,
    });
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("workspace_1");

    const session = await getValidatedSession(new Request("http://localhost"));

    expect(session).toEqual({ userId: "user_1", email: "member@example.com", workspaceId: "workspace_1" });
    expect(mocks.listWorkspaceMembershipsByUserId).toHaveBeenCalledWith("user_1");
    expect(mocks.findWorkspaceIdByMemberEmail).not.toHaveBeenCalled();
  });

  it("returns null when the JWT fails verification", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: { message: "invalid" } });

    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
    expect(mocks.findWorkspaceIdByMemberEmail).not.toHaveBeenCalled();
  });

  it("returns null when the user has no workspace membership", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "orphan@example.com" } },
      error: null,
    });
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue(null);
    mocks.listWorkspaceMembershipsByUserId.mockResolvedValue([]);

    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
  });

  it("returns null when the application session hook rejects access", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "member@example.com" } },
      error: null,
    });
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("workspace_1");

    const session = await getValidatedSession(new Request("http://localhost"), {
      validateApplicationSession: async () => false,
    });

    expect(session).toBeNull();
  });

  it.each(["SUSPENDED", "DELETION_PENDING"])("rejects a %s workspace", async (workspaceStatus) => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "member@example.com", iat: 1_788_172_800 } },
      error: null,
    });
    mocks.getApplicationAccessState.mockResolvedValue({ userStatus: "ACTIVE", workspaceStatus, sessionInvalidBefore: null });

    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
  });

  it("rejects a suspended user", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "member@example.com", iat: 1_788_172_800 } },
      error: null,
    });
    mocks.getApplicationAccessState.mockResolvedValue({ userStatus: "SUSPENDED", workspaceStatus: "ACTIVE", sessionInvalidBefore: null });

    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
  });

  it("rejects tokens issued before sessionInvalidBefore", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "member@example.com", iat: Math.floor(Date.parse("2026-08-31T09:59:00.000Z") / 1000) } },
      error: null,
    });
    mocks.getApplicationAccessState.mockResolvedValue({
      userStatus: "ACTIVE",
      workspaceStatus: "ACTIVE",
      sessionInvalidBefore: "2026-08-31T10:00:00.000Z",
    });

    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
  });

  it("falls back to normalized email once and binds the stable user id", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "Member@Example.com", iat: 1_788_172_800 } },
      error: null,
    });
    mocks.listWorkspaceMembershipsByUserId.mockResolvedValue([]);
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("workspace_1");

    expect(await getValidatedSession(new Request("http://localhost"))).toMatchObject({ workspaceId: "workspace_1" });
    expect(mocks.bindMemberUserId).toHaveBeenCalledWith("workspace_1", "member@example.com", "user_1");
  });
});

describe("safeNextPath", () => {
  it("rejects external and backslash-based post-login redirects", () => {
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath("/automations?tab=active")).toBe("/automations?tab=active");
  });
});
