import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), warn: vi.fn(), error: vi.fn() }));
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
vi.mock("@/src/lib/logger", () => ({ logger: { warn: mocks.warn, error: mocks.error, info: vi.fn(), debug: vi.fn() } }));

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
    mocks.warn.mockReset();
    mocks.error.mockReset();
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

  it("signs the session out and says try again when provisioning hits a database failure", async () => {
    vi.spyOn(repository, "ensureWorkspace").mockRejectedValue(new Error("db down"));
    const response = await login({ email: "a@example.com", next: "/automations" });
    expect(response.headers.get("location")).toBe("https://app.linkar.in/login?error=unavailable&next=%2Fautomations");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.error).toHaveBeenCalledWith("Workspace provisioning at sign-in failed", { error: "db down" });
  });

  it("still calls an account with nowhere to land invalid when nothing failed", async () => {
    // No user id from Supabase, so there is nothing to provision for.
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: null });
    const response = await login({ email: "a@example.com" });
    expect(response.headers.get("location")).toContain("/login?error=invalid");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("signs the session out and says try again when the workspace lookup throws", async () => {
    vi.spyOn(repository, "findWorkspaceIdByMemberEmail").mockRejectedValue(new Error("Timed out fetching a new connection from the connection pool."));
    const response = await login({ email: "a@example.com", next: "/automations" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.linkar.in/login?error=unavailable&next=%2Fautomations");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it.each([
    ["unreachable or timed out", new AuthRetryableFetchError("fetch failed", 0)],
    ["answering 503", new AuthRetryableFetchError("Service Unavailable", 503)],
    ["answering another 5xx", new AuthApiError("HTTP Version Not Supported", 505, undefined)],
  ])("does not call the password wrong when Supabase Auth is %s", async (_case, error) => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error });
    const response = await login({ email: "a@example.com", next: "/automations", invite: "raw" });
    expect(response.headers.get("location")).toBe("https://app.linkar.in/login?error=unavailable&next=%2Fautomations&invite=raw");
    expect(mocks.warn).toHaveBeenCalledWith("Supabase Auth unavailable at sign-in", { status: error.status });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("does not call the password wrong when Supabase Auth rate limits the sign-in", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit") });
    const limited = await login({ email: "a@example.com" });
    expect(limited.headers.get("location")).toContain("/login?error=unavailable");

    // Either signal alone is enough.
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { code: "over_request_rate_limit", message: "Request rate limit reached" } });
    expect((await login({ email: "a@example.com" })).headers.get("location")).toContain("/login?error=unavailable");
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: new AuthApiError("Too many requests", 429, undefined) });
    expect((await login({ email: "a@example.com" })).headers.get("location")).toContain("/login?error=unavailable");
  });

  it("still counts attempts Supabase Auth could not check, so an outage gives no free guesses", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("Service Unavailable", 503) });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await login({ email: "outage@example.com" }, {}, "203.0.113.77");
      expect(response.headers.get("location")).toContain("error=unavailable");
    }
    const sixth = await login({ email: "outage@example.com" }, {}, "203.0.113.77");
    expect(sixth.headers.get("location")).toContain("error=locked");
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
