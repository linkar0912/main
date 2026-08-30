import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildGoogleAuthorizeUrl, exchangeGoogleCode, GoogleOAuthError } from "./google-oauth";

const CONFIG = {
  googleClientId: "client-1",
  googleClientSecret: "secret-1",
  googleRedirectUri: "https://linkar.in/api/auth/oauth/google/callback",
};

describe("buildGoogleAuthorizeUrl", () => {
  it("builds Google's authorize URL with our redirect_uri, an OIDC scope, and state", () => {
    const url = new URL(buildGoogleAuthorizeUrl("state-123", "nonce-456", CONFIG));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.googleRedirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("sends Google a SHA-256 hash of the nonce, not the raw value - Supabase's signInWithIdToken hashes the raw nonce it's given and compares it to the (hashed) nonce claim in the ID token", () => {
    const url = new URL(buildGoogleAuthorizeUrl("state-123", "nonce-456", CONFIG));
    expect(url.searchParams.get("nonce")).toBe(createHash("sha256").update("nonce-456").digest("hex"));
  });

  it("throws when Google isn't configured", () => {
    expect(() => buildGoogleAuthorizeUrl("s", "n", { ...CONFIG, googleClientId: undefined })).toThrow();
  });
});

describe("exchangeGoogleCode", () => {
  it("posts the code to Google's token endpoint and returns the ID token", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ id_token: "id-token-abc" }), { status: 200 }));
    const result = await exchangeGoogleCode("code-1", CONFIG, fetcher as unknown as typeof fetch);

    expect(result).toEqual({ idToken: "id-token-abc" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init?.body as string);
    expect(body.get("client_id")).toBe("client-1");
    expect(body.get("client_secret")).toBe("secret-1");
    expect(body.get("code")).toBe("code-1");
    expect(body.get("redirect_uri")).toBe(CONFIG.googleRedirectUri);
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("throws GoogleOAuthError when Google returns an error response", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(exchangeGoogleCode("bad-code", CONFIG, fetcher as unknown as typeof fetch))
      .rejects.toBeInstanceOf(GoogleOAuthError);
  });

  it("throws when the response has no id_token", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: "at" }), { status: 200 }));
    await expect(exchangeGoogleCode("code-1", CONFIG, fetcher as unknown as typeof fetch)).rejects.toThrow();
  });

  it("throws when Google isn't configured", async () => {
    await expect(exchangeGoogleCode("code-1", { ...CONFIG, googleClientSecret: undefined })).rejects.toThrow();
  });
});
