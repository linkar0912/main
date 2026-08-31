import { NextResponse } from "next/server";
import { safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { completeOAuthSignIn } from "@/src/lib/auth/complete-oauth-signin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

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
  const inviteRaw = url.searchParams.get("invite") ?? "";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth", env.appUrl), 303);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) {
    return NextResponse.redirect(new URL("/login?error=oauth", env.appUrl), 303);
  }
  await completeOAuthSignIn({ email: data.user.email, userId: data.user.id, inviteRaw, repository });
  return NextResponse.redirect(new URL(next, env.appUrl), 303);
}
