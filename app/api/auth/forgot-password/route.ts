import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { LoginRateLimitStore, loginRateLimitKey, networkRateLimitKey } from "@/src/lib/auth/rate-limit";
import { clientAddress } from "@/src/lib/auth/client-address";
import { rejectCrossSiteRequest } from "@/src/lib/security/same-origin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

// Per email+network, plus a per-network cap so the form cannot be used to
// send reset emails to an unbounded list of addresses.
let limiter: LoginRateLimitStore | undefined;
let networkLimiter: LoginRateLimitStore | undefined;
const NETWORK_RESETS_PER_HOUR = 20;

export async function POST(request: Request) {
    const crossSite = rejectCrossSiteRequest(request);
    if (crossSite) return crossSite;

    const env = getServerEnv();
    limiter ??= new LoginRateLimitStore(env.redisUrl, 5, 15 * 60 * 1_000, "forgot-password");
    networkLimiter ??= new LoginRateLimitStore(env.redisUrl, NETWORK_RESETS_PER_HOUR, 60 * 60 * 1_000, "forgot-password");
    const address = clientAddress(request, env.trustedProxyHops);
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const limitKey = loginRateLimitKey(env.authSessionSecret, email || "-", address);
    const networkKey = networkRateLimitKey(env.authSessionSecret, "forgot-password", address);
    if ((networkKey && !(await networkLimiter.consume(networkKey))) || !(await limiter.consume(limitKey))) {
        return NextResponse.redirect(new URL("/forgot-password?sent=1", env.appUrl), 303);
    }

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
