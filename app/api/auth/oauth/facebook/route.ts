import { NextResponse } from "next/server";
import { setFacebookSignInReturn } from "@/src/lib/auth/facebook-signin-return";
import { safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { applicationOriginForPath } from "@/src/lib/site-routing";

export const runtime = "nodejs";

// GET, not POST: a form POST here would redirect out to Supabase and then to
// Facebook, and Chrome's `form-action 'self'` CSP directive blocks the
// entire redirect chain a form submission causes, not just the immediate
// target - a plain link navigation isn't subject to that directive at all.
//
// Google sign-in no longer goes through Supabase's hosted relay - see
// app/api/auth/oauth/google/{start,callback} for its direct-to-Google flow,
// which avoids Google's consent screen showing the Supabase project's domain
// instead of ours. Facebook's classic web login doesn't cleanly produce an
// OIDC ID token the same way, so it stays on this relay.
export async function GET(request: Request) {
  const env = getServerEnv();
  const url = new URL(request.url);
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const destinationOrigin = applicationOriginForPath(nextPath, env);
  const inviteRaw = url.searchParams.get("invite") ?? "";

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "facebook",
    options: {
      // Exactly the URL on Supabase's redirect allow list. Supabase matches
      // redirectTo including its query string, so carrying next and invite
      // here stopped the exact entry matching and Supabase sent people to the
      // Site URL instead of this callback. They travel in a signed cookie
      // (facebook-signin-return.ts) instead.
      redirectTo: new URL("/auth/oauth/callback", env.appUrl).toString(),
      // Supabase's own default scope for Facebook is `email` alone, which
      // this app's Facebook Login for Business setup rejects outright as an
      // invalid scope combination - Meta requires public_profile alongside
      // it (confirmed directly against Facebook's own authorize endpoint).
      scopes: "email public_profile",
      // Facebook does not ask again for a permission the person declined
      // once unless told to, and without email the sign-in cannot finish.
      queryParams: { auth_type: "rerequest" },
    },
  });
  if (error || !data?.url) {
    return NextResponse.redirect(new URL("/login?error=oauth", destinationOrigin), 303);
  }
  return setFacebookSignInReturn(NextResponse.redirect(data.url, 303), { next: nextPath, invite: inviteRaw }, env);
}
