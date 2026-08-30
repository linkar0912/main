import { createHash } from "node:crypto";
import type { ServerEnv } from "@/src/lib/env";

/** Errors raised while exchanging a Google authorization code for an ID token. */
export class GoogleOAuthError extends Error {
  readonly retryable: boolean;

  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GoogleOAuthError";
    this.retryable = status === 429 || status >= 500;
  }
}

type GoogleOAuthConfig = Pick<ServerEnv, "googleClientId" | "googleClientSecret" | "googleRedirectUri">;

/**
 * Builds Google's own authorize URL directly (bypassing Supabase's hosted
 * `/auth/v1/authorize` relay) so the consent screen shows our redirect_uri's
 * domain instead of the Supabase project's. `openid` is required to get an
 * ID token back; `state` carries next/invite (Google's redirect_uri must
 * match a pre-registered value exactly, so it can't carry dynamic query
 * params itself).
 *
 * Google is sent a SHA-256 hash of `nonce`, not the raw value: Supabase's
 * signInWithIdToken hashes whatever raw nonce *it's* given and compares that
 * hash to the ID token's `nonce` claim, so the claim must already be a hash
 * for the two to match - callers pass the same raw `nonce` straight through
 * to signInWithIdToken.
 */
export function buildGoogleAuthorizeUrl(
  state: string,
  nonce: string,
  config: Pick<GoogleOAuthConfig, "googleClientId" | "googleRedirectUri">,
): string {
  if (!config.googleClientId) throw new Error("Google sign-in is not configured");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.googleClientId);
  url.searchParams.set("redirect_uri", config.googleRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", createHash("sha256").update(nonce).digest("hex"));
  return url.toString();
}

/**
 * Exchanges the code Google returned for an ID token, using our own client
 * secret - Supabase never sees this leg of the flow. The ID token itself is
 * handed to supabase.auth.signInWithIdToken() to create the actual session.
 */
export async function exchangeGoogleCode(
  code: string,
  config: GoogleOAuthConfig,
  fetcher: typeof fetch = fetch,
): Promise<{ idToken: string }> {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error("Google sign-in is not configured");
  }
  const body = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    redirect_uri: config.googleRedirectUri,
    code,
    grant_type: "authorization_code",
  });
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error_description === "string"
      ? payload.error_description
      : typeof payload.error === "string"
        ? payload.error
        : `Google token exchange failed (${response.status})`;
    throw new GoogleOAuthError(message, response.status);
  }
  const idToken = typeof payload.id_token === "string" ? payload.id_token : "";
  if (!idToken) throw new GoogleOAuthError("Google did not return an ID token", 502);
  return { idToken };
}
