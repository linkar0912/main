import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
let repository = createMemoryRepository();

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({
    appUrl: "https://app.linkar.in",
    adminUrl: "https://admin.linkar.in",
    publicSiteUrl: "https://linkar.in",
    redisUrl: undefined,
    trustedProxyHops: 1,
    authSessionSecret: "test-secret-at-least-32-characters",
    platformOwnerUserIds: [],
  }),
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut } }),
}));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { POST } = await import("./route");

let ipCounter = 0;
function login(fields: Record<string, string>, headers: Record<string, string> = {}, ip = `198.51.100.${++ipCounter}`) {
  return POST(new Request("https://app.linkar.in/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip, ...headers },
    body: new URLSearchParams({ password: "correct horse battery", ...fields }).toString(),
  }));
}

describe("POST /api/auth/login flows", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.signIn.mockReset().mockResolvedValue({ data: { user: { id: "user_1", user_metadata: {} } }, error: null });
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
  });

  it("rejects a cross-site login post (login CSRF) before checking credentials", async () => {
    const response = await login({ email: "a@example.com" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("names an unconfirmed email instead of calling the password wrong, keeping next and invite", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { code: "email_not_confirmed", message: "Email not confirmed" } });
    const response = await login({ email: "a@example.com", next: "/automations", invite: "raw" });
    expect(response.headers.get("location"))
      .toBe("https://app.linkar.in/login?error=unconfirmed&next=%2Fautomations&invite=raw&email=a%40example.com");
  });

  it("provisions a workspace at the first verified sign-in when signup deferred it", async () => {
    const response = await login({ email: "a@example.com", next: "/automations" });
    expect(response.headers.get("location")).toBe("https://app.linkar.in/automations");
    expect(await repository.findWorkspaceIdByMemberEmail("a@example.com")).not.toBeNull();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("signs the session out when no workspace can be provisioned", async () => {
    vi.spyOn(repository, "ensureWorkspace").mockRejectedValue(new Error("db down"));
    const response = await login({ email: "a@example.com" });
    expect(response.headers.get("location")).toContain("/login?error=invalid");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("locks one network out of an account without locking the owner out elsewhere", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { code: "invalid_credentials", message: "bad" } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login({ email: "victim@example.com", password: "guess" }, {}, "203.0.113.66");
    }
    const attacker = await login({ email: "victim@example.com", password: "guess" }, {}, "203.0.113.66");
    expect(attacker.headers.get("location")).toContain("error=locked");

    mocks.signIn.mockResolvedValue({ data: { user: { id: "user_v", user_metadata: {} } }, error: null });
    const owner = await login({ email: "victim@example.com" }, {}, "192.0.2.10");
    expect(owner.headers.get("location")).toBe("https://app.linkar.in/dashboard");
  });
});
