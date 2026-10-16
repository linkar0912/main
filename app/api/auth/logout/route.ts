import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { ADMIN_HOST, resolveRequestHostname } from "@/src/lib/site-routing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const env = getServerEnv();
  const supabase = await createSupabaseServerClient();
  // signOut() defaults to scope "global" (every session) - pass "local"
  // explicitly so a normal logout only revokes this one session and a copied
  // cookie elsewhere can't be replayed. "Sign out everywhere" lives in
  // /api/account instead.
  await supabase.auth.signOut({ scope: "local" });
  const hostname = resolveRequestHostname(request.headers, new URL(request.url).hostname).toLowerCase().replace(/:\d+$/, "");
  // Signing out of the owner console comes back to its own sign-in page, with
  // next=/admin so signing in again returns to the console on this host.
  const login = hostname === ADMIN_HOST ? new URL("/login?next=%2Fadmin", env.adminUrl) : new URL("/login", env.appUrl);
  return NextResponse.redirect(login, 303);
}
