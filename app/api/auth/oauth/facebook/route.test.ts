import { beforeEach, describe, expect, it, vi } from "vitest";
import { FACEBOOK_SIGNIN_RETURN_COOKIE, readFacebookSignInReturn } from "@/src/lib/auth/facebook-signin-return";

const SECRET = "test-secret-at-least-32-characters";

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({
    appUrl: "http://localhost:3000",
    adminUrl: "http://localhost:3000",
    publicSiteUrl: "http://localhost:3000",
    authSessionSecret: SECRET,
  }),
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

/** The request Cookie header a browser would send back after this response. */
function returnCookieHeader(response: Response): string {
  const match = new RegExp(`${FACEBOOK_SIGNIN_RETURN_COOKIE}=([^;]*)`).exec(response.headers.get("set-cookie") ?? "");
  return match ? `${FACEBOOK_SIGNIN_RETURN_COOKIE}=${match[1]}` : "";
}

beforeEach(() => {
  mocks.signInWithOAuth.mockReset().mockResolvedValue({ data: { url: "https://www.facebook.com/dialog/oauth?x=1" }, error: null });
});

describe("GET /api/auth/oauth/facebook", () => {
  it("sends Supabase the bare callback URL its allow list accepts, and keeps next and invite in a signed cookie instead", async () => {
    const response = await GET(oauthRequest({ next: "/automations", invite: "tok" }));

    expect(mocks.signInWithOAuth).toHaveBeenCalledTimes(1);
    const call = mocks.signInWithOAuth.mock.calls[0][0];
    expect(call.provider).toBe("facebook");
    // A query string on redirectTo stops Supabase's exact allow-list entry
    // from matching, and Supabase then falls back to the Site URL.
    expect(call.options.redirectTo).toBe("http://localhost:3000/auth/oauth/callback");
    expect(call.options.redirectTo).not.toContain("?");
    expect(response.status).toBe(303);
    expect(location(response)).toBe("https://www.facebook.com/dialog/oauth?x=1");
    expect(readFacebookSignInReturn(returnCookieHeader(response), SECRET)).toEqual({ next: "/automations", invite: "tok" });
  });

  it("asks Facebook again for an email permission the person declined before", async () => {
    await GET(oauthRequest({ next: "/automations" }));
    const call = mocks.signInWithOAuth.mock.calls[0][0];
    expect(call.options.queryParams).toEqual({ auth_type: "rerequest" });
  });

  it("requests public_profile alongside email - Supabase's default scope is email alone, which this app's Facebook Login for Business setup rejects outright as an invalid scope combination", async () => {
    await GET(oauthRequest({ next: "/automations" }));
    const call = mocks.signInWithOAuth.mock.calls[0][0];
    expect(call.options.scopes).toBe("email public_profile");
  });

  it("stores an empty invite when none was given", async () => {
    const response = await GET(oauthRequest({ next: "/automations" }));
    expect(readFacebookSignInReturn(returnCookieHeader(response), SECRET)).toEqual({ next: "/automations", invite: "" });
  });

  it("shares the cookie across linkar.in in production, because the callback always runs on app.linkar.in", async () => {
    vi.resetModules();
    vi.doMock("@/src/lib/env", () => ({
      getServerEnv: () => ({
        appUrl: "https://app.linkar.in",
        adminUrl: "https://admin.linkar.in",
        publicSiteUrl: "https://linkar.in",
        authSessionSecret: SECRET,
      }),
    }));
    const { GET: GetProduction } = await import("./route");
    const response = await GetProduction(new Request("https://admin.linkar.in/api/auth/oauth/facebook?next=/automations&invite=tok"));

    expect(mocks.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe("https://app.linkar.in/auth/oauth/callback");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${FACEBOOK_SIGNIN_RETURN_COOKIE}=`);
    expect(setCookie).toContain("Domain=linkar.in");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Max-Age=1800");
    expect(setCookie).toContain("Secure");
  });

  it("redirects to login with error=oauth when Supabase fails to produce an authorize URL", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: "boom" } });
    const response = await GET(oauthRequest({ next: "/automations" }));
    expect(location(response)).toContain("/login?error=oauth");
  });
});
