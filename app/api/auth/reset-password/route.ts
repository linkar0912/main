import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const env = getServerEnv();
    const form = await request.formData();
    const password = String(form.get("password") ?? "");

    if (password.length < 12 || password.length > 200) {
        return NextResponse.redirect(new URL("/reset-password?error=password", env.appUrl), 303);
    }

    // Reaching this page requires having already verified a recovery link via
    // /auth/confirm, which establishes a session - there's no separate token
    // to check here.
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
        return NextResponse.redirect(new URL("/reset-password?error=invalid", env.appUrl), 303);
    }

    // Invalidate every session for this user, including the attacker's if the
    // account was compromised and including the one just used to reset it,
    // then let them sign in fresh.
    await supabase.auth.signOut({ scope: "global" });
    return NextResponse.redirect(new URL("/login?reset=1", env.appUrl), 303);
}
