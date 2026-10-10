import { NextResponse } from "next/server";
import { safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { completeOAuthSignIn } from "@/src/lib/auth/complete-oauth-signin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { applicationOriginForPath } from "@/src/lib/site-routing";
import { authPageUrl, sanitizeInvite } from "@/src/lib/auth/auth-redirect";

export const runtime = "nodejs";

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
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const destinationOrigin = applicationOriginForPath(next, env);
  const inviteRaw = sanitizeInvite(url.searchParams.get("invite"));

  // next/invite ride along on every error redirect so an invited teammate who
  // cancels or hits an error can retry without losing the invitation.
  const backToLogin = (error: string) =>
    NextResponse.redirect(authPageUrl("/login", { error, next, invite: inviteRaw }, env.appUrl), 303);

  if (!code) {
    // Supabase relays the provider's error; access_denied means the person
    // pressed Cancel on Facebook's consent screen.
    return backToLogin(url.searchParams.get("error") === "access_denied" ? "cancelled" : "oauth");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return backToLogin("oauth");
  await completeOAuthSignIn({ email: data.user.email, userId: data.user.id, inviteRaw, repository });
  return NextResponse.redirect(new URL(next, destinationOrigin), 303);
}
