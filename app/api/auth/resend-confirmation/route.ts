import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { safeNextPath } from "@/src/lib/auth/session";
import { authPageUrl, sanitizeInvite } from "@/src/lib/auth/auth-redirect";
import { clientAddress } from "@/src/lib/auth/client-address";
import { LoginRateLimitStore, loginRateLimitKey, networkRateLimitKey } from "@/src/lib/auth/rate-limit";
import { rejectCrossSiteRequest } from "@/src/lib/security/same-origin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Signed-out counterpart of /api/account's resend-verification: three sends
// per address per network per hour, and a per-network cap so the endpoint
// cannot be used to mail-bomb arbitrary addresses.
let resendLimiter: LoginRateLimitStore | undefined;
let networkLimiter: LoginRateLimitStore | undefined;

// POST /api/auth/resend-confirmation - re-sends the signup confirmation email.
// The response never says whether the address has an account or still needs
// confirming (no enumeration).
export async function POST(request: Request) {
    const crossSite = rejectCrossSiteRequest(request);
    if (crossSite) return crossSite;

    const env = getServerEnv();
    resendLimiter ??= new LoginRateLimitStore(env.redisUrl, 3, 60 * 60 * 1_000);
    networkLimiter ??= new LoginRateLimitStore(env.redisUrl, 20, 60 * 60 * 1_000);
    const address = clientAddress(request, env.trustedProxyHops);
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const next = safeNextPath(String(form.get("next") ?? ""));
    const invite = sanitizeInvite(String(form.get("invite") ?? ""));
    const fromSignup = form.get("from") === "signup";
    const done = (params: Record<string, string>) => NextResponse.redirect(
        fromSignup
            ? authPageUrl("/signup", { sent: "1", email, ...params, next, invite }, env.appUrl)
            : authPageUrl("/login", { ...params, next, invite }, env.appUrl),
        303,
    );

    if (!EMAIL_PATTERN.test(email)) return done({ error: "resend-email" });
    const networkKey = networkRateLimitKey(env.authSessionSecret, "resend-confirmation", address);
    if (networkKey && !(await networkLimiter.consume(networkKey))) return done({ error: "resend-locked" });
    if (!(await resendLimiter.consume(loginRateLimitKey(env.authSessionSecret, email, address)))) {
        return done({ error: "resend-locked" });
    }

    const confirmUrl = new URL("/auth/confirm", env.appUrl);
    confirmUrl.searchParams.set("type", "signup");
    confirmUrl.searchParams.set("next", next);
    if (invite) confirmUrl.searchParams.set("invite", invite);
    const supabase = await createSupabaseServerClient();
    // Errors (unknown or already-confirmed address, provider throttling) are
    // swallowed: the response is identical either way.
    await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: confirmUrl.toString() },
    }).catch(() => undefined);
    return done({ notice: "resent" });
}
