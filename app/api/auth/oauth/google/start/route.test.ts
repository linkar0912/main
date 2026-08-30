import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { readGoogleOAuthState } from "@/src/lib/auth/google-oauth-state";

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({
    appUrl: "http://localhost:3000",
    authSessionSecret: "test-secret-at-least-32-characters",
    googleClientId: "client-1",
    googleClientSecret: "secret-1",
    googleRedirectUri: "http://localhost:3000/api/auth/oauth/google/callback",
  }),
}));

const { GET } = await import("./route");

function startRequest(params: Record<string, string>): Request {
  const query = new URLSearchParams(params);
  return new Request(`http://localhost/api/auth/oauth/google/start?${query.toString()}`);
}

function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

describe("GET /api/auth/oauth/google/start", () => {
  it("redirects to Google's real authorize endpoint with our own redirect_uri, carrying next/invite via the signed state", async () => {
    const response = await GET(startRequest({ next: "/automations", invite: "tok-123" }));

    const url = new URL(location(response));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/oauth/google/callback");
    expect(url.searchParams.get("scope")).toBe("openid email profile");

    const state = url.searchParams.get("state")!;
    const decoded = readGoogleOAuthState(state, "test-secret-at-least-32-characters");
    expect(decoded?.next).toBe("/automations");
    expect(decoded?.invite).toBe("tok-123");
    // Google gets a SHA-256 hash of the nonce, not the raw value stored in
    // state - see src/lib/auth/google-oauth.ts for why.
    expect(url.searchParams.get("nonce")).toBe(createHash("sha256").update(decoded!.nonce).digest("hex"));
  });

  it("sets an httpOnly state cookie matching the state param", async () => {
    const response = await GET(startRequest({ next: "/automations" }));
    const url = new URL(location(response));
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`linkar_google_oauth_state=${url.searchParams.get("state")}`);
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("redirects to login with error=oauth when Google sign-in isn't configured", async () => {
    vi.resetModules();
    vi.doMock("@/src/lib/env", () => ({
      getServerEnv: () => ({
        appUrl: "http://localhost:3000",
        authSessionSecret: "test-secret-at-least-32-characters",
        googleClientId: undefined,
        googleClientSecret: undefined,
        googleRedirectUri: "http://localhost:3000/api/auth/oauth/google/callback",
      }),
    }));
    const { GET: GetWithoutConfig } = await import("./route");
    const response = await GetWithoutConfig(startRequest({ next: "/automations" }));
    expect(location(response)).toBe("http://localhost:3000/login?error=oauth");
  });
});
