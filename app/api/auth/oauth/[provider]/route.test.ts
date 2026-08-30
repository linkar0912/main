import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ appUrl: "http://localhost:3000" }),
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithOAuth: mocks.signInWithOAuth } }),
}));

const { POST } = await import("./route");

function oauthRequest(provider: string, fields: Record<string, string>): Request {
  const form = new URLSearchParams(fields);
  return new Request(`http://localhost/api/auth/oauth/${provider}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

function paramsFor(provider: string) {
  return { params: Promise.resolve({ provider }) };
}

function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

beforeEach(() => {
  mocks.signInWithOAuth.mockReset().mockResolvedValue({ data: { url: "https://accounts.google.com/authorize?x=1" }, error: null });
});

describe("POST /api/auth/oauth/[provider]", () => {
  it("rejects a provider that isn't google or facebook", async () => {
    const response = await POST(oauthRequest("twitter", { next: "/dashboard" }), paramsFor("twitter"));
    expect(location(response)).toContain("/login?error=oauth");
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("starts the Google OAuth flow, carrying next and invite through the callback redirect", async () => {
    const response = await POST(
      oauthRequest("google", { next: "/automations", invite: "tok-123" }),
      paramsFor("google"),
    );

    expect(mocks.signInWithOAuth).toHaveBeenCalledTimes(1);
    const call = mocks.signInWithOAuth.mock.calls[0][0];
    expect(call.provider).toBe("google");
    const redirectTo = new URL(call.options.redirectTo);
    expect(redirectTo.pathname).toBe("/auth/oauth/callback");
    expect(redirectTo.searchParams.get("next")).toBe("/automations");
    expect(redirectTo.searchParams.get("invite")).toBe("tok-123");
    expect(response.status).toBe(303);
    expect(location(response)).toBe("https://accounts.google.com/authorize?x=1");
  });

  it("starts the Facebook OAuth flow", async () => {
    await POST(oauthRequest("facebook", { next: "/automations" }), paramsFor("facebook"));
    expect(mocks.signInWithOAuth.mock.calls[0][0].provider).toBe("facebook");
  });

  it("omits the invite param from the callback redirect when none was given", async () => {
    await POST(oauthRequest("google", { next: "/automations" }), paramsFor("google"));
    const redirectTo = new URL(mocks.signInWithOAuth.mock.calls[0][0].options.redirectTo);
    expect(redirectTo.searchParams.has("invite")).toBe(false);
  });

  it("redirects to login with error=oauth when Supabase fails to produce an authorize URL", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: "boom" } });
    const response = await POST(oauthRequest("google", { next: "/automations" }), paramsFor("google"));
    expect(location(response)).toContain("/login?error=oauth");
  });
});
