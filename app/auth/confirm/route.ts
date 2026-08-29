import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { safeNextPath } from "@/src/lib/auth/session";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Shared landing page for every Supabase auth email link (signup confirmation,
// password recovery). Uses verifyOtp(token_hash) rather than PKCE code
// exchange: the link is opened cold, often on a different device than the one
// that requested it, so there is no code-verifier cookie to exchange against.
export async function GET(request: Request) {
    const env = getServerEnv();
    const url = new URL(request.url);
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type") as EmailOtpType | null;
    const next = safeNextPath(url.searchParams.get("next"));

    if (tokenHash && type) {
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (!error) {
            const destination = type === "recovery" ? "/reset-password" : next;
            return NextResponse.redirect(new URL(destination, env.appUrl), 303);
        }
    }

    const failureDestination = type === "recovery" ? "/reset-password?error=invalid" : "/login?verify=invalid";
    return NextResponse.redirect(new URL(failureDestination, env.appUrl), 303);
}
