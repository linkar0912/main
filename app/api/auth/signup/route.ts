import { NextResponse } from "next/server";
import { safeNextPath } from "@/src/lib/auth/session";
import { LoginRateLimitStore } from "@/src/lib/auth/rate-limit";
import { clientAddress } from "@/src/lib/auth/client-address";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { createId } from "@/src/lib/id";
import { hashToken } from "@/src/lib/auth/tokens";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

// Signup attempts per IP per hour. Reuses the Redis-backed limiter: every
// attempt is recorded, so isAllowed() acts as a simple count cap.
let signupLimiter: LoginRateLimitStore | undefined;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 12;

export async function POST(request: Request) {
    const env = getServerEnv();
    const repository = getRepository();
    signupLimiter ??= new LoginRateLimitStore(env.redisUrl);
    const address = clientAddress(request, env.trustedProxyHops);
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const nextPath = safeNextPath(String(form.get("next") ?? "/automations"));

    if (!(await signupLimiter.isAllowed(address))) {
        return NextResponse.redirect(new URL("/signup?error=locked", env.appUrl), 303);
    }
    await signupLimiter.recordFailure(address);

    if (!EMAIL_PATTERN.test(email)) {
        return NextResponse.redirect(new URL("/signup?error=email&next=" + encodeURIComponent(nextPath), env.appUrl), 303);
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
        return NextResponse.redirect(new URL(`/signup?error=password&email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`, env.appUrl), 303);
    }

    // Team invitations bind the new account to the inviting workspace instead of
    // provisioning a fresh one. The invite must match the signing-up email exactly.
    const inviteRaw = String(form.get("invite") ?? "");
    const invitation = inviteRaw ? await repository.findInvitationByTokenHash(hashToken(inviteRaw)) : null;
    const inviteValid = Boolean(
        invitation && !invitation.acceptedAt && !invitation.revokedAt
        && invitation.email === email && invitation.expiresAt > new Date().toISOString(),
    );
    if (inviteRaw && !inviteValid) {
        return NextResponse.redirect(new URL("/signup?error=invite&email=" + encodeURIComponent(email), env.appUrl), 303);
    }

    const supabase = await createSupabaseServerClient();
    const confirmUrl = new URL("/auth/confirm", env.appUrl);
    confirmUrl.searchParams.set("type", "signup");
    confirmUrl.searchParams.set("next", nextPath);
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: confirmUrl.toString() },
    });
    if (error) {
        if (error.code === "email_exists" || error.code === "user_already_exists") {
            return NextResponse.redirect(new URL("/login?error=exists", env.appUrl), 303);
        }
        if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
            return NextResponse.redirect(new URL("/signup?error=locked", env.appUrl), 303);
        }
        if (error.code === "weak_password") {
            return NextResponse.redirect(
                new URL(`/signup?error=password&email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`, env.appUrl),
                303,
            );
        }
        if (error.code === "email_address_invalid") {
            return NextResponse.redirect(new URL("/signup?error=email&next=" + encodeURIComponent(nextPath), env.appUrl), 303);
        }
        return NextResponse.redirect(new URL("/signup?error=unknown", env.appUrl), 303);
    }
    // An empty identities array is Supabase's anti-enumeration signal that the
    // email is already registered - it returns a user object, not an error.
    if (data.user && data.user.identities?.length === 0) {
        return NextResponse.redirect(new URL("/login?error=exists", env.appUrl), 303);
    }

    const workspaceId = inviteValid && invitation ? invitation.workspaceId : createId("workspace");
    if (!invitation) await repository.ensureWorkspace(workspaceId, email);
    if (invitation) await repository.acceptInvitation(invitation.id, new Date().toISOString());

    if (data.session) {
        return NextResponse.redirect(new URL(nextPath, env.appUrl), 303);
    }
    return NextResponse.redirect(
        new URL(`/signup?sent=1&next=${encodeURIComponent(nextPath)}`, env.appUrl),
        303,
    );
}
