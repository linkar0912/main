import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { exchangeGoogleCode } from "@/src/lib/auth/google-oauth";
import { GOOGLE_OAUTH_STATE_COOKIE, readGoogleOAuthState } from "@/src/lib/auth/google-oauth-state";
import { completeOAuthSignIn } from "@/src/lib/auth/complete-oauth-signin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

function withoutStateCookie(response: NextResponse): NextResponse {
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return response;
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

  const oauthErrorRedirect = () =>
    withoutStateCookie(NextResponse.redirect(new URL("/login?error=oauth", env.appUrl), 303));

  if (!code || !stateParam || !storedState || stateParam !== storedState) {
    return oauthErrorRedirect();
  }
  const decoded = readGoogleOAuthState(stateParam, env.authSessionSecret);
  if (!decoded) {
    return oauthErrorRedirect();
  }

  let idToken: string;
  try {
    ({ idToken } = await exchangeGoogleCode(code, env));
  } catch {
    return oauthErrorRedirect();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: decoded.nonce,
  });
  if (error || !data.user?.email) {
    return oauthErrorRedirect();
  }

  await completeOAuthSignIn({ email: data.user.email, inviteRaw: decoded.invite ?? "", repository });
  return withoutStateCookie(NextResponse.redirect(new URL(decoded.next, env.appUrl), 303));
}
