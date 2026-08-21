import { NextResponse } from "next/server";
import {
    createSessionToken,
    hashPassword,
    safeNextPath,
    sessionCookieName,
} from "@/src/lib/auth/session";
import { LoginRateLimitStore } from "@/src/lib/auth/rate-limit";
import { clientAddress } from "@/src/lib/auth/client-address";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { createId } from "@/src/lib/id";
import { hashToken, issueAuthToken } from "@/src/lib/auth/tokens";
import { emailVerificationEmail, sendEmail } from "@/src/lib/mailer";

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

    const existingUser = await repository.findUserByEmail(email);
    if (existingUser) {
        // Do not reveal whether the email exists beyond what signup already shows;
        // send them to login with a neutral message.
        return NextResponse.redirect(new URL("/login?error=exists", env.appUrl), 303);
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

    const workspaceId = inviteValid && invitation ? invitation.workspaceId : createId("workspace");
    if (!invitation) await repository.ensureWorkspace(workspaceId, email);
    const passwordHash = await hashPassword(password);
    const { created, record: user } = await repository.createUser({ email, passwordHash });
    if (!created) {
        // Lost a race with a concurrent signup for the same email.
        return NextResponse.redirect(new URL("/login?error=exists", env.appUrl), 303);
    }
    if (invitation) await repository.acceptInvitation(invitation.id, new Date().toISOString());

    // Fire-and-forget verification email; signup never blocks on the mailer.
    void issueAuthToken(user.id, "EMAIL_VERIFY").then((raw) =>
        sendEmail(emailVerificationEmail(env.appUrl, `/api/auth/verify-email?token=${encodeURIComponent(raw)}`)(user.email)),
    ).catch(() => undefined);

    const response = NextResponse.redirect(new URL(nextPath, env.appUrl), 303);
    response.cookies.set({
        name: sessionCookieName(env.appUrl),
        value: createSessionToken({ userId: user.id, workspaceId }, env.authSessionSecret),
        httpOnly: true,
        sameSite: "lax",
        secure: env.appUrl.startsWith("https://"),
        maxAge: 24 * 60 * 60,
        path: "/",
    });
    return response;
}