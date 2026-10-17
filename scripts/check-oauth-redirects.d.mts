export type OAuthRedirectCheckResult = { ok: true };

/**
 * Anonymous release check: Facebook sign-in, and its Cancel, must return to
 * {appUrl}/auth/oauth/callback, and Google sign-in must name
 * {appUrl}/api/auth/oauth/google/callback as its redirect_uri.
 */
export function checkOAuthRedirects(options: {
  appUrl: string;
  /** The Supabase project URL, for example https://<ref>.supabase.co. */
  supabaseUrl: string;
  fetch?: typeof globalThis.fetch;
  /** Retries cover network failures, timeouts, 429 and 5xx only. */
  attempts?: number;
  wait?: () => Promise<void>;
  timeoutMs?: number;
}): Promise<OAuthRedirectCheckResult>;
