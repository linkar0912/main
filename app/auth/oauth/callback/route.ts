import { NextResponse } from "next/server";
import { safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { getRepository } from "@/src/lib/repository-provider";
import { completeOAuthSignInResult, type OAuthSignInResult } from "@/src/lib/auth/complete-oauth-signin";
import { supabaseAuthCookieOptions } from "@/src/lib/auth/cookie-domain";
import { clearFacebookSignInReturn, readFacebookSignInReturn } from "@/src/lib/auth/facebook-signin-return";
import { parseCookieHeader, supabaseSessionStorageKey } from "@/src/lib/auth/session-cookie-cleanup";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { applicationOriginForPath } from "@/src/lib/site-routing";
import { authPageUrl, sanitizeInvite } from "@/src/lib/auth/auth-redirect";

export const runtime = "nodejs";

type Env = ReturnType<typeof getServerEnv>;

/**
 * Why Supabase's relay came back without a code, as a login page error.
 * Supabase reports a banned account, closed signups and an unconfirmed
 * provider email as error=access_denied too, with an error_code saying which;
 * only a plain access_denied is the person pressing Cancel on Facebook.
 */
function providerErrorCode(params: URLSearchParams): string {
  if ((params.get("error_description") ?? "").includes("Error getting user email from external provider")) return "oauth-no-email";
  const code = params.get("error_code");
  if (code === "user_banned") return "oauth-blocked";
  if (code === "signup_disabled") return "oauth-signup-disabled";
  if (code === "provider_email_needs_verification") return "oauth-confirm";
  return params.get("error") === "access_denied" ? "cancelled" : "oauth";
}

const PKCE_FLOW_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** auth-js's PKCE verifier cookies: the fixed one, the flows index and each flow's slot. */
function isPkceVerifierCookie(name: string, storageKey: string): boolean {
  if (name === `${storageKey}-code-verifier` || name === `${storageKey}-flows-code-verifier`) return true;
  const prefix = `${storageKey}-flow-`;
  const suffix = "-code-verifier";
  return name.startsWith(prefix) && name.endsWith(suffix) && PKCE_FLOW_ID.test(name.slice(prefix.length, name.length - suffix.length));
}

/**
 * Deletes every PKCE verifier cookie the request carried. A server-side
 * exchange has no flow id, so auth-js removes only the fixed verifier and
 * leaves each flow's slot and the flows index behind, one more on every
 * sign-in until the ring of five is full.
 */
function withoutPkceVerifiers(response: NextResponse, cookieHeader: string | null, env: Env): NextResponse {
  const storageKey = supabaseSessionStorageKey(env.supabaseUrl);
  const names = new Set(parseCookieHeader(cookieHeader ?? "").map(({ name }) => name).filter((name) => isPkceVerifierCookie(name, storageKey)));
  for (const name of names) response.cookies.set({ name, value: "", ...supabaseAuthCookieOptions(env), maxAge: 0 });
  return response;
}

function isOwnerConsolePath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Ends the session this callback just created. A failure here must not turn the redirect into an error page. */
async function signOutLocally(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) logger.warn("Sign-out after an unfinished Facebook sign-in failed", { status: error.status, code: error.code });
  } catch (error) {
    logger.warn("Sign-out after an unfinished Facebook sign-in failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

// Lands here after signInWithOAuth (app/api/auth/oauth/facebook/route.ts)
// redirects through Supabase's hosted relay and Facebook, then back. Google
// no longer uses this path - see app/api/auth/oauth/google/{start,callback}
// for its direct-to-Google flow. Unlike /auth/confirm this uses the PKCE
// code exchange, not verifyOtp - the round trip returns to the same browser
// that started it, so the code-verifier cookie is present.
export async function GET(request: Request) {
  const env = getServerEnv();
  const repository = getRepository();
  const url = new URL(request.url);
  const cookieHeader = request.headers.get("cookie");
  const code = url.searchParams.get("code");
  // next/invite come from the signed cookie the start route set. The query
  // string is the fallback: local development's allow list still accepts
  // them on redirectTo, and a redirect started before the cookie existed
  // still carries them.
  const stored = readFacebookSignInReturn(cookieHeader, env.authSessionSecret);
  const next = stored ? stored.next : safeNextPath(url.searchParams.get("next"));
  const inviteRaw = stored ? stored.invite : sanitizeInvite(url.searchParams.get("invite"));
  const destinationOrigin = applicationOriginForPath(next, env);

  // The return cookie is for this one round trip, so every exit clears it.
  // next/invite ride along on every error redirect so an invited teammate who
  // cancels or hits an error can retry without losing the invitation.
  const backToLogin = (error: string) =>
    clearFacebookSignInReturn(NextResponse.redirect(authPageUrl("/login", { error, next, invite: inviteRaw }, env.appUrl), 303), env);

  // No code: nothing was exchanged, so any verifier cookie may still belong
  // to a sign-in in progress and stays.
  if (!code) return backToLogin(providerErrorCode(url.searchParams));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  // The code is spent whether or not that worked.
  const spent = (response: NextResponse) => withoutPkceVerifiers(response, cookieHeader, env);
  if (error) {
    logger.warn("Facebook sign-in code exchange failed", { status: error.status, code: error.code });
    return spent(backToLogin("oauth"));
  }
  if (!data.user?.email) {
    // Never leave a session behind for an account this app cannot name.
    await signOutLocally(supabase);
    return spent(backToLogin("oauth-no-email"));
  }

  // A platform owner heading for the owner console needs no workspace, the
  // same as a password sign-in (app/api/auth/login/route.ts).
  const ownerConsoleOnly = env.platformOwnerUserIds.includes(data.user.id.toLowerCase()) && isOwnerConsolePath(next);
  if (!ownerConsoleOnly) {
    let result: OAuthSignInResult;
    try {
      result = await completeOAuthSignInResult({ email: data.user.email, userId: data.user.id, inviteRaw, repository, refuseInvalidInvite: true });
    } catch (provisionError) {
      // The database failing: sign the new session out, since nothing could
      // check where it should land, and ask the person to try again.
      logger.error("Workspace provisioning after Facebook sign-in failed", {
        error: provisionError instanceof Error ? provisionError.message : String(provisionError),
      });
      await signOutLocally(supabase);
      return spent(backToLogin("oauth-unavailable"));
    }
    if (result.status === "invite-invalid") {
      await signOutLocally(supabase);
      return spent(backToLogin("invite-mismatch"));
    }
  }
  return spent(clearFacebookSignInReturn(NextResponse.redirect(new URL(next, destinationOrigin), 303), env));
}
