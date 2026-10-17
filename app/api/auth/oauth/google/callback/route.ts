import { NextRequest, NextResponse } from "next/server";
import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { exchangeGoogleCode } from "@/src/lib/auth/google-oauth";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  readGoogleOAuthState,
  readGoogleOAuthStateContext,
} from "@/src/lib/auth/google-oauth-state";
import { completeOAuthSignInResult, type OAuthSignInResult } from "@/src/lib/auth/complete-oauth-signin";
import { pendingInviteFromUser } from "@/src/lib/auth/invitations";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { logger } from "@/src/lib/logger";
import { sharedAuthCookieDomain } from "@/src/lib/auth/cookie-domain";
import { applicationOriginForPath } from "@/src/lib/site-routing";
import { authPageUrl } from "@/src/lib/auth/auth-redirect";

export const runtime = "nodejs";

function withoutStateCookie(response: NextResponse, env: ReturnType<typeof getServerEnv>): NextResponse {
  const domain = sharedAuthCookieDomain(env);
  if (domain) {
    response.cookies.set({ name: GOOGLE_OAUTH_STATE_COOKIE, value: "", domain, path: "/", maxAge: 0 });
  } else {
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  }
  return response;
}

/**
 * signInWithIdToken's error as a login page error. Supabase Auth not
 * answering, or rate limiting this server (which every visitor shares), says
 * nothing about the account, so it is "try again in a minute".
 */
function idTokenErrorCode(error: AuthError): string {
  if (isAuthRetryableFetchError(error) || error.status === 429 || (error.status ?? 0) >= 500 || error.code === "over_request_rate_limit") {
    return "oauth-unavailable";
  }
  if (error.code === "provider_email_needs_verification") return "oauth-confirm";
  if (error.code === "user_banned") return "oauth-blocked";
  if (error.code === "signup_disabled") return "oauth-signup-disabled";
  return "oauth";
}

function isOwnerConsolePath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Ends the session this callback just created. A failure here must not turn the redirect into an error page. */
async function signOutLocally(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) logger.warn("Sign-out after an unfinished Google sign-in failed", { status: error.status, code: error.code });
  } catch (error) {
    logger.warn("Sign-out after an unfinished Google sign-in failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

// Lands here after app/api/auth/oauth/google/start redirects through Google
// directly (not Supabase's hosted relay). We exchange the code with Google
// ourselves, then hand the resulting ID token to Supabase's
// signInWithIdToken to create the actual session.
export async function GET(request: NextRequest) {
  const env = getServerEnv();
  const repository = getRepository();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const storedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const stateMatches = Boolean(stateParam && storedState && stateParam === storedState);

  // Error redirects keep next/invite from any state this app signed, expired
  // or not, cookie or not, so a teammate who comes back late or in another
  // tab keeps their invitation. Only a state that matches the cookie and has
  // not expired lets a sign-in through (readGoogleOAuthState below).
  const context = stateParam ? readGoogleOAuthStateContext(stateParam, env.authSessionSecret) : null;
  // The state cookie is cleared only by the callback it belongs to: a stale
  // or foreign callback must not end a sign-in still in progress in another
  // tab.
  const finish = (response: NextResponse) => (stateMatches ? withoutStateCookie(response, env) : response);
  const oauthErrorRedirect = (error = "oauth") =>
    finish(NextResponse.redirect(
      authPageUrl("/login", { error, next: context?.next, invite: context?.invite }, env.appUrl),
      303,
    ));

  const providerError = url.searchParams.get("error");
  if (providerError) {
    logger.warn("Google OAuth redirect returned an error", { error: providerError });
    // The person pressed Cancel on Google's consent screen; not a failure.
    return oauthErrorRedirect(providerError === "access_denied" ? "cancelled" : "oauth");
  }
  if (!code || !stateParam || !stateMatches) {
    logger.warn("Google OAuth callback failed state validation", {
      hasCode: Boolean(code),
      hasStateParam: Boolean(stateParam),
      hasStoredState: Boolean(storedState),
      stateMatches,
    });
    return oauthErrorRedirect();
  }
  const decoded = readGoogleOAuthState(stateParam, env.authSessionSecret);
  if (!decoded) {
    logger.warn("Google OAuth state signature was invalid or expired");
    return oauthErrorRedirect();
  }

  let idToken: string;
  try {
    ({ idToken } = await exchangeGoogleCode(code, env));
  } catch (error) {
    logger.error("Google OAuth code exchange failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return oauthErrorRedirect();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: decoded.nonce,
  });
  if (error) {
    logger.error("Supabase signInWithIdToken failed for Google sign-in", { status: error.status, code: error.code });
    return oauthErrorRedirect(idTokenErrorCode(error));
  }
  if (!data.user?.email) {
    logger.error("Supabase signInWithIdToken returned no user email for Google sign-in");
    // Never leave a session behind for an account this app cannot name.
    await signOutLocally(supabase);
    return oauthErrorRedirect();
  }

  // A platform owner heading for the owner console needs no workspace, the
  // same as a password sign-in (app/api/auth/login/route.ts).
  const ownerConsoleOnly = env.platformOwnerUserIds.includes(data.user.id.toLowerCase()) && isOwnerConsolePath(decoded.next);
  if (!ownerConsoleOnly) {
    let result: OAuthSignInResult;
    try {
      result = await completeOAuthSignInResult({
        email: data.user.email,
        userId: data.user.id,
        // An invitation kept in the account's metadata by an earlier password
        // signup is accepted too, as password sign-in and email confirmation
        // do. Only an invite this sign-in brought along is refused when it
        // does not resolve; a stale one in the metadata falls through to a
        // fresh workspace there as well.
        inviteRaw: decoded.invite || pendingInviteFromUser(data.user),
        repository,
        refuseInvalidInvite: Boolean(decoded.invite),
      });
    } catch (provisionError) {
      // The database failing: sign the new session out, since nothing could
      // check where it should land, and ask the person to try again.
      logger.error("Workspace provisioning after Google sign-in failed", {
        error: provisionError instanceof Error ? provisionError.message : String(provisionError),
      });
      await signOutLocally(supabase);
      return oauthErrorRedirect("oauth-unavailable");
    }
    if (result.status === "invite-invalid") {
      await signOutLocally(supabase);
      return oauthErrorRedirect("invite-mismatch");
    }
  }
  const destinationOrigin = applicationOriginForPath(decoded.next, env);
  return finish(NextResponse.redirect(new URL(decoded.next, destinationOrigin), 303));
}
