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

export async function POST(request: Request, context: RouteContext) {
  const env = getServerEnv();
  const { provider } = await context.params;
  if (!isSupportedProvider(provider)) {
    return NextResponse.redirect(new URL("/login?error=oauth", env.appUrl), 303);
  }

  const form = await request.formData();
  const nextPath = safeNextPath(String(form.get("next") ?? "/automations"));
  const inviteRaw = String(form.get("invite") ?? "");

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
