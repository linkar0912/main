import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), workspace: vi.fn() }));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in", redisUrl: undefined, trustedProxyHops: 0, authSessionSecret: "test-secret-at-least-32-characters", platformOwnerUserIds: ["11111111-1111-4111-8111-111111111111"] }) }));
vi.mock("@/src/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { signInWithPassword: mocks.signIn } }) }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ findWorkspaceIdByMemberEmail: mocks.workspace }) }));

const { POST } = await import("./route");

function request(next: string) {
  const body = new FormData(); body.set("email", "owner@linkar.in"); body.set("password", "password"); body.set("next", next);
  return new Request("https://admin.linkar.in/api/auth/login", { method: "POST", body });
}

describe("owner login origin", () => {
  beforeEach(() => { mocks.signIn.mockReset().mockResolvedValue({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } }, error: null }); mocks.workspace.mockReset().mockResolvedValue(null); });
  it("allows an allowlisted owner without a workspace and stays on admin.linkar.in", async () => {
    const response = await POST(request("/admin"));
    expect(response.headers.get("location")).toBe("https://admin.linkar.in/admin");
  });
  it("keeps ordinary workspace navigation on app.linkar.in", async () => {
    mocks.workspace.mockResolvedValue("workspace-1");
    const response = await POST(request("/dashboard"));
    expect(response.headers.get("location")).toBe("https://app.linkar.in/dashboard");
  });
});
