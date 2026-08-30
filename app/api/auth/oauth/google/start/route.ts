import { NextResponse } from "next/server";
import { safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { buildGoogleAuthorizeUrl } from "@/src/lib/auth/google-oauth";
import { createGoogleOAuthState, GOOGLE_OAUTH_STATE_COOKIE } from "@/src/lib/auth/google-oauth-state";

export const runtime = "nodejs";

// Talks to Google directly instead of through Supabase's hosted OAuth relay,
// so Google's consent screen shows this app's own domain - see
// src/lib/auth/google-oauth.ts for why.
export async function GET(request: Request) {
  const env = getServerEnv();
  if (!env.googleClientId) {
    return NextResponse.redirect(new URL("/login?error=oauth", env.appUrl), 303);
  }

  const url = new URL(request.url);
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const inviteRaw = url.searchParams.get("invite") ?? "";

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
  });
  return response;
}
