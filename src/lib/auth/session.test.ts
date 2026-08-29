import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  findWorkspaceIdByMemberEmail: vi.fn(),
}));

vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ findWorkspaceIdByMemberEmail: mocks.findWorkspaceIdByMemberEmail }),
}));

const { getValidatedSession, safeNextPath } = await import("./session");

describe("getValidatedSession", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.findWorkspaceIdByMemberEmail.mockReset();
  });

  it("resolves a verified session to userId/email/workspaceId", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "member@example.com" } },
      error: null,
    });
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("workspace_1");

    const session = await getValidatedSession(new Request("http://localhost"));

    expect(session).toEqual({ userId: "user_1", email: "member@example.com", workspaceId: "workspace_1" });
    expect(mocks.findWorkspaceIdByMemberEmail).toHaveBeenCalledWith("member@example.com");
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

    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
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
