import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  findInvitationByTokenHash: vi.fn(),
  ensureWorkspace: vi.fn(),
  acceptInvitation: vi.fn(),
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({
    appUrl: "http://localhost:3000",
    redisUrl: undefined,
    authSessionSecret: "test-secret-at-least-32-characters",
    trustedProxyHops: 0,
  }),
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signUp: mocks.signUp } }),
}));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    findInvitationByTokenHash: mocks.findInvitationByTokenHash,
    ensureWorkspace: mocks.ensureWorkspace,
    acceptInvitation: mocks.acceptInvitation,
  }),
}));
vi.mock("@/src/lib/id", () => ({ createId: (prefix: string) => `${prefix}_fixed` }));

const { POST } = await import("./route");

function signupRequest(fields: Record<string, string>, ip = "203.0.113.1"): Request {
  const form = new URLSearchParams(fields);
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "cf-connecting-ip": ip, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

beforeEach(() => {
  mocks.signUp.mockReset().mockResolvedValue({ data: { user: { id: "user-signup", identities: [{ id: "identity_1" }] }, session: { id: "sess_1" } }, error: null });
  mocks.findInvitationByTokenHash.mockReset().mockResolvedValue(null);
  mocks.ensureWorkspace.mockReset();
  mocks.acceptInvitation.mockReset();
});

describe("POST /api/auth/signup", () => {
  it("rejects a malformed email", async () => {
    const response = await POST(signupRequest({ email: "not-an-email", password: "long-enough-password" }, "203.0.113.1"));
    expect(location(response)).toContain("/signup?error=email");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects a password under 12 characters", async () => {
    const response = await POST(signupRequest({ email: "a@example.com", password: "short" }, "203.0.113.2"));
    expect(location(response)).toContain("/signup?error=password");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects an invite token that doesn't match the signing-up email", async () => {
    mocks.findInvitationByTokenHash.mockResolvedValue({
      id: "inv_1", workspaceId: "ws_1", email: "invited@example.com", role: "MEMBER",
      tokenHash: "hash", invitedByUserId: "u_1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(),
    });
    const response = await POST(signupRequest({
      email: "someone-else@example.com", password: "long-enough-password", invite: "raw-token",
    }, "203.0.113.3"));
    expect(location(response)).toContain("/signup?error=invite");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("accepts the invitation and joins its workspace on a valid invite", async () => {
    mocks.findInvitationByTokenHash.mockResolvedValue({
      id: "inv_1", workspaceId: "ws_invited", email: "invited@example.com", role: "MEMBER",
      tokenHash: "hash", invitedByUserId: "u_1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(),
    });
    const response = await POST(signupRequest({
      email: "invited@example.com", password: "long-enough-password", invite: "raw-token", next: "/automations",
    }, "203.0.113.4"));
    expect(mocks.acceptInvitation).toHaveBeenCalledWith("inv_1", expect.any(String), "user-signup");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
    expect(location(response)).toBe("http://localhost:3000/automations");
  });

  it("provisions a fresh workspace when there is no invite", async () => {
    const response = await POST(signupRequest({ email: "fresh@example.com", password: "long-enough-password" }, "203.0.113.5"));
    expect(mocks.ensureWorkspace).toHaveBeenCalledWith("workspace_fixed", "fresh@example.com", "user-signup");
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
  });

  it("sends to /signup?sent=1 when Supabase requires email confirmation", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "user-signup", identities: [{ id: "identity_1" }] }, session: null }, error: null });
    const response = await POST(signupRequest({ email: "fresh@example.com", password: "long-enough-password" }, "203.0.113.6"));
    expect(location(response)).toContain("/signup?sent=1");
  });

  it("redirects to login with error=exists when Supabase reports the email already exists", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "email_exists" } });
    const response = await POST(signupRequest({ email: "taken@example.com", password: "long-enough-password" }, "203.0.113.7"));
    expect(location(response)).toContain("/login?error=exists");
  });

  it("redirects to login with error=exists when Supabase's anti-enumeration signal fires (empty identities)", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    const response = await POST(signupRequest({ email: "taken@example.com", password: "long-enough-password" }, "203.0.113.8"));
    expect(location(response)).toContain("/login?error=exists");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
  });

  it("locks out further attempts from the same address after too many signups", async () => {
    const ip = "198.51.100.9";
    for (let i = 0; i < 5; i++) {
      await POST(signupRequest({ email: `user${i}@example.com`, password: "long-enough-password" }, ip));
    }
    const response = await POST(signupRequest({ email: "user6@example.com", password: "long-enough-password" }, ip));
    expect(location(response)).toContain("/signup?error=locked");
  });
});
