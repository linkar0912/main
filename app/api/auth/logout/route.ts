import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const env = getServerEnv();
  const supabase = await createSupabaseServerClient();
  // signOut() defaults to scope "global" (every session) - pass "local"
  // explicitly so a normal logout only revokes this one session and a copied
  // cookie elsewhere can't be replayed. "Sign out everywhere" lives in
  // /api/account instead.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", env.appUrl), 303);
}
