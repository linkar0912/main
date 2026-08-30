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

const { GET } = await import("./route");

function oauthRequest(params: Record<string, string>): Request {
  const query = new URLSearchParams(params);
  return new Request(`http://localhost/api/auth/oauth/facebook?${query.toString()}`);
}

function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

beforeEach(() => {
  mocks.signInWithOAuth.mockReset().mockResolvedValue({ data: { url: "https://www.facebook.com/dialog/oauth?x=1" }, error: null });
});

describe("GET /api/auth/oauth/facebook", () => {
  it("starts the Facebook OAuth flow via Supabase's hosted relay, carrying next and invite through the callback redirect", async () => {
    const response = await GET(oauthRequest({ next: "/automations", invite: "tok-123" }));

    expect(mocks.signInWithOAuth).toHaveBeenCalledTimes(1);
    const call = mocks.signInWithOAuth.mock.calls[0][0];
    expect(call.provider).toBe("facebook");
    const redirectTo = new URL(call.options.redirectTo);
    expect(redirectTo.pathname).toBe("/auth/oauth/callback");
    expect(redirectTo.searchParams.get("next")).toBe("/automations");
    expect(redirectTo.searchParams.get("invite")).toBe("tok-123");
    expect(response.status).toBe(303);
    expect(location(response)).toBe("https://www.facebook.com/dialog/oauth?x=1");
  });

  it("omits the invite param from the callback redirect when none was given", async () => {
    await GET(oauthRequest({ next: "/automations" }));
    const redirectTo = new URL(mocks.signInWithOAuth.mock.calls[0][0].options.redirectTo);
    expect(redirectTo.searchParams.has("invite")).toBe(false);
  });

  it("redirects to login with error=oauth when Supabase fails to produce an authorize URL", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: "boom" } });
    const response = await GET(oauthRequest({ next: "/automations" }));
    expect(location(response)).toContain("/login?error=oauth");
  });
});
