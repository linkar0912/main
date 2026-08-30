import { NextResponse } from "next/server";
import { safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { resolveInvitation } from "@/src/lib/auth/invitations";
import { provisionWorkspace } from "@/src/lib/auth/provision-workspace";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

// Lands here after signInWithOAuth (app/api/auth/oauth/[provider]/route.ts)
// redirects through Google/Facebook and back. Unlike /auth/confirm this uses
// the PKCE code exchange, not verifyOtp - the round trip returns to the same
// browser that started it, so the code-verifier cookie is present.
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
  const email = data.user.email.toLowerCase();

  const existingWorkspaceId = await repository.findWorkspaceIdByMemberEmail(email);
  if (existingWorkspaceId) {
    return NextResponse.redirect(new URL(next, env.appUrl), 303);
  }

  // First time this email has signed in. An invalid or missing invite both
  // fall through to a fresh workspace rather than blocking sign-in - unlike
  // password signup, the Supabase account already exists by this point, so
  // there's no account creation left to refuse.
  const invitationResolution = await resolveInvitation({ inviteRaw, email, repository });
  await provisionWorkspace({
    email,
    invitation: invitationResolution.status === "valid" ? invitationResolution.invitation : null,
    repository,
  });

  return NextResponse.redirect(new URL(next, env.appUrl), 303);
}
