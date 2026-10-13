import { NextResponse } from "next/server";
import { safeNextPath } from "@/src/lib/auth/session";
import { LoginRateLimitStore, loginRateLimitKey, networkRateLimitKey } from "@/src/lib/auth/rate-limit";
import { clientAddress } from "@/src/lib/auth/client-address";
import { authPageUrl, sanitizeInvite } from "@/src/lib/auth/auth-redirect";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { PENDING_INVITE_METADATA_KEY, resolveInvitation } from "@/src/lib/auth/invitations";
import { provisionWorkspace } from "@/src/lib/auth/provision-workspace";
import { rejectCrossSiteRequest } from "@/src/lib/security/same-origin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { planIntentFromRequest } from "@/src/lib/billing/plan-intent-cookie";
import { withPlanIntentParams } from "@/src/lib/billing/plan-intent";

export const runtime = "nodejs";

// Signup attempts per identity (email+IP) per 15 minutes. consume() counts
// each attempt atomically and reports whether it is within the cap. The
// per-network cap stops one address from creating accounts (and sending
// confirmation emails) for an unbounded list of emails.
let signupLimiter: LoginRateLimitStore | undefined;
let networkLimiter: LoginRateLimitStore | undefined;
const NETWORK_SIGNUPS_PER_HOUR = 20;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 12;

export async function POST(request: Request) {
    const crossSite = rejectCrossSiteRequest(request);
    if (crossSite) return crossSite;

    const env = getServerEnv();
    const repository = getRepository();
    signupLimiter ??= new LoginRateLimitStore(env.redisUrl, 5, 15 * 60 * 1_000, "signup");
    networkLimiter ??= new LoginRateLimitStore(env.redisUrl, NETWORK_SIGNUPS_PER_HOUR, 60 * 60 * 1_000, "signup");
    const address = clientAddress(request, env.trustedProxyHops);
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const nextPath = safeNextPath(String(form.get("next") ?? "/automations"));
    const inviteRaw = sanitizeInvite(String(form.get("invite") ?? ""));
    const page = (pathname: "/signup" | "/login", params: Record<string, string | undefined>) =>
        NextResponse.redirect(authPageUrl(pathname, { ...params, next: nextPath, invite: inviteRaw }, env.appUrl), 303);

    if (!EMAIL_PATTERN.test(email)) return page("/signup", { error: "email" });
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) return page("/signup", { error: "password", email });

    const networkKey = networkRateLimitKey(env.authSessionSecret, "signup", address);
    if (networkKey && !(await networkLimiter.consume(networkKey))) return page("/signup", { error: "locked" });
    const limitKey = loginRateLimitKey(env.authSessionSecret, email || "-", address);
    if (!(await signupLimiter.consume(limitKey))) return page("/signup", { error: "locked" });

    // Team invitations bind the new account to the inviting workspace instead of
    // provisioning a fresh one. The invite must match the signing-up email exactly.
    // Checking it here only validates; nothing is consumed until the email is
    // verified.
    const invitationResolution = await resolveInvitation({ inviteRaw, email, repository });
    if (invitationResolution.status === "invalid") return page("/signup", { error: "invite", email });

    const supabase = await createSupabaseServerClient();
    const confirmUrl = new URL("/auth/confirm", env.appUrl);
    confirmUrl.searchParams.set("type", "signup");
    confirmUrl.searchParams.set("next", nextPath);
    if (inviteRaw) confirmUrl.searchParams.set("invite", inviteRaw);
    // The link may be opened in another browser, so the plan picked on
    // /pricing rides along and /api/auth/confirm remembers it there too.
    withPlanIntentParams(confirmUrl, inviteRaw ? null : planIntentFromRequest(request));
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: confirmUrl.toString(),
            ...(inviteRaw ? { data: { [PENDING_INVITE_METADATA_KEY]: inviteRaw } } : {}),
        },
    });
    if (error) {
        if (error.code === "email_exists" || error.code === "user_already_exists") {
            return page("/login", { error: "exists", email });
        }
        if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
            return page("/signup", { error: "locked" });
        }
        if (error.code === "weak_password") return page("/signup", { error: "password", email });
        if (error.code === "email_address_invalid") return page("/signup", { error: "email" });
        return page("/signup", { error: "unknown" });
    }
    // An empty identities array is Supabase's anti-enumeration signal that the
    // email is already registered - it returns a user object, not an error.
    if (data.user && data.user.identities?.length === 0) {
        return page("/login", { error: "exists", email });
    }

    if (data.session) {
        // Supabase issued a session immediately, i.e. this project does not
        // require email confirmation; there is no later verification step to
        // defer to, so provision now.
        await provisionWorkspace({
            email,
            userId: data.user!.id,
            invitation: invitationResolution.status === "valid" ? invitationResolution.invitation : null,
            repository,
        });
        return NextResponse.redirect(new URL(nextPath, env.appUrl), 303);
    }
    // Email confirmation pending: the workspace (or invitation acceptance) is
    // provisioned by /auth/confirm, or by the first verified sign-in, so an
    // unverified address can neither claim an invitation nor create a
    // workspace.
    return page("/signup", { sent: "1", email });
}
