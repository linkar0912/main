import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn(), trustedProxyHops: 1 }));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({
    appUrl: "http://localhost:3000",
    redisUrl: undefined,
    authSessionSecret: "test-secret-at-least-32-characters",
    trustedProxyHops: mocks.trustedProxyHops,
  }),
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { resetPasswordForEmail: mocks.resetPasswordForEmail } }),
}));

const { POST } = await import("./route");

function forgotRequest(email: string, ip: string): Request {
  return new Request("http://localhost:3000/api/auth/forgot-password", {
    method: "POST",
    headers: { "cf-connecting-ip": ip, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email }).toString(),
  });
}

beforeEach(() => {
  mocks.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
});

describe("POST /api/auth/forgot-password", () => {
  it("sends the reset email and answers the same way whether or not the account exists", async () => {
    const response = await POST(forgotRequest("someone@example.com", "203.0.113.20"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/forgot-password?sent=1");
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("stops sending to one address after five requests from the same network", async () => {
    for (let i = 0; i < 5; i++) await POST(forgotRequest("target@example.com", "203.0.113.21"));
    mocks.resetPasswordForEmail.mockClear();
    const response = await POST(forgotRequest("target@example.com", "203.0.113.21"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/forgot-password?sent=1");
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("caps reset emails per network across different addresses", async () => {
    for (let i = 0; i < 20; i++) await POST(forgotRequest(`victim-${i}@example.com`, "203.0.113.22"));
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(20);
    const response = await POST(forgotRequest("victim-final@example.com", "203.0.113.22"));
    // Same answer as a real send: the cap is not observable to the caller.
    expect(response.headers.get("location")).toBe("http://localhost:3000/forgot-password?sent=1");
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(20);
  });
});
