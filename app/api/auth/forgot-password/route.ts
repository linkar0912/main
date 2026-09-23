import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { LoginRateLimitStore, loginRateLimitKey } from "@/src/lib/auth/rate-limit";
import { clientAddress } from "@/src/lib/auth/client-address";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

let limiter: LoginRateLimitStore | undefined;

export async function POST(request: Request) {
    const env = getServerEnv();
    limiter ??= new LoginRateLimitStore(env.redisUrl);
    const address = clientAddress(request, env.trustedProxyHops);
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const limitKey = loginRateLimitKey(env.authSessionSecret, email || "-", address);
    if (!(await limiter.isAllowed(limitKey))) {
        return NextResponse.redirect(new URL("/forgot-password?sent=1", env.appUrl), 303);
    }
    await limiter.recordFailure(limitKey);

    if (email) {
        const confirmUrl = new URL("/auth/confirm", env.appUrl);
        confirmUrl.searchParams.set("type", "recovery");
        const supabase = await createSupabaseServerClient();
        // Errors are swallowed deliberately: the response below never signals
        // whether the account exists (no enumeration).
        await supabase.auth.resetPasswordForEmail(email, { redirectTo: confirmUrl.toString() });
    }
    // Always the same response whether or not the account exists (no enumeration).
    return NextResponse.redirect(new URL("/forgot-password?sent=1", env.appUrl), 303);
}
