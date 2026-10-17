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

  it("asks Google for the account chooser only when told to (an invited sign-in)", () => {
    expect(new URL(buildGoogleAuthorizeUrl("s", "n", CONFIG)).searchParams.has("prompt")).toBe(false);
    expect(new URL(buildGoogleAuthorizeUrl("s", "n", CONFIG, { selectAccount: false })).searchParams.has("prompt")).toBe(false);
    expect(new URL(buildGoogleAuthorizeUrl("s", "n", CONFIG, { selectAccount: true })).searchParams.get("prompt")).toBe("select_account");
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

  it("gives up after 10 s when Google's token endpoint never answers", async () => {
    // Hand the exchange a timeout signal the test can fire.
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    try {
      // Stands in for fetch against a server that never answers: it rejects
      // only when its signal fires, as fetch does.
      const fetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }));
      const pending = exchangeGoogleCode("code-1", CONFIG, fetcher as unknown as typeof fetch).catch((caught: unknown) => caught);

      expect(timeoutSpy).toHaveBeenCalledWith(10_000);
      expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
      controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

      const error = await pending;
      expect(error).toBeInstanceOf(GoogleOAuthError);
      expect(error).toMatchObject({ status: 0, retryable: false, message: "Google token exchange timed out" });
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("treats an aborted exchange like a timeout", async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException("This operation was aborted", "AbortError");
    });
    await expect(exchangeGoogleCode("code-1", CONFIG, fetcher as unknown as typeof fetch))
      .rejects.toMatchObject({ name: "GoogleOAuthError", status: 0 });
  });

  it("passes other network failures through unchanged", async () => {
    const failure = new TypeError("fetch failed");
    const fetcher = vi.fn(async () => {
      throw failure;
    });
    await expect(exchangeGoogleCode("code-1", CONFIG, fetcher as unknown as typeof fetch)).rejects.toBe(failure);
  });
});
