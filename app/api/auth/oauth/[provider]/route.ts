import { NextResponse } from "next/server";
import { safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

const SUPPORTED_PROVIDERS = ["google", "facebook"] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

function isSupportedProvider(value: string): value is SupportedProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

type RouteContext = { params: Promise<{ provider: string }> };

// GET, not POST: a form POST here would redirect out to Supabase and then to
// Google/Facebook, and Chrome's `form-action 'self'` CSP directive blocks the
// entire redirect chain a form submission causes, not just the immediate
// target - a plain link navigation isn't subject to that directive at all.
export async function GET(request: Request, context: RouteContext) {
  const env = getServerEnv();
  const { provider } = await context.params;
  if (!isSupportedProvider(provider)) {
    return NextResponse.redirect(new URL("/login?error=oauth", env.appUrl), 303);
  }

  const url = new URL(request.url);
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const inviteRaw = url.searchParams.get("invite") ?? "";

  const redirectTo = new URL("/auth/oauth/callback", env.appUrl);
  redirectTo.searchParams.set("next", nextPath);
  if (inviteRaw) redirectTo.searchParams.set("invite", inviteRaw);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectTo.toString() },
  });
  if (error || !data?.url) {
    return NextResponse.redirect(new URL("/login?error=oauth", env.appUrl), 303);
  }
  return NextResponse.redirect(data.url, 303);
}
