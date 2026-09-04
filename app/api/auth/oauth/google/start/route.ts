import { NextResponse } from "next/server";
import { safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { buildGoogleAuthorizeUrl } from "@/src/lib/auth/google-oauth";
import { createGoogleOAuthState, GOOGLE_OAUTH_STATE_COOKIE } from "@/src/lib/auth/google-oauth-state";
import { sharedAuthCookieDomain } from "@/src/lib/auth/cookie-domain";
import { applicationOriginForPath } from "@/src/lib/site-routing";

export const runtime = "nodejs";

// Talks to Google directly instead of through Supabase's hosted OAuth relay,
// so Google's consent screen shows this app's own domain - see
// src/lib/auth/google-oauth.ts for why.
export async function GET(request: Request) {
  const env = getServerEnv();
  const url = new URL(request.url);
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const destinationOrigin = applicationOriginForPath(nextPath, env);
  if (!env.googleClientId) {
    return NextResponse.redirect(new URL("/login?error=oauth", destinationOrigin), 303);
  }

  const inviteRaw = url.searchParams.get("invite") ?? "";
  const cookieDomain = sharedAuthCookieDomain(env);

  const { state, nonce } = createGoogleOAuthState(
    { next: nextPath, ...(inviteRaw ? { invite: inviteRaw } : {}) },
    env.authSessionSecret,
  );
  const response = NextResponse.redirect(
    buildGoogleAuthorizeUrl(state, nonce, env),
    303,
  );
  response.cookies.set({
    name: GOOGLE_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    maxAge: 600,
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
  return response;
}
