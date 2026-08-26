import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { getValidatedSession, hashPassword, sessionCookieName, verifyPassword } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { LoginRateLimitStore } from "@/src/lib/auth/rate-limit";
import { issueAuthToken } from "@/src/lib/auth/tokens";
import { emailVerificationEmail, sendEmail } from "@/src/lib/mailer";

export const runtime = "nodejs";

// Resend attempts per user per hour. A separate, tighter limiter than login's -
// this only ever sends mail to the account's own verified-pending address.
let resendVerificationLimiter: LoginRateLimitStore | undefined;

// GET /api/account - identity for the signed-in user (sidebar chip, profile).
export async function GET(request: Request) {
    const session = await getValidatedSession(request);
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const repository = getRepository();
    const user = await repository.findUserById(session.userId);
    if (!user) return Response.json({ error: "Account not found" }, { status: 404 });
    const role = await repository.getMemberRole(session.workspaceId, user.email);

    return Response.json({
        data: {
            id: session.userId,
            email: user.email,
            workspaceId: session.workspaceId,
            role: role ?? "MEMBER",
            plan: "free",
            memberSince: user.createdAt,
            emailVerified: Boolean(user.emailVerifiedAt),
        },
    });
}

// POST /api/account - form actions for the signed-in user:
//   action=change-password       (currentPassword, newPassword)
//   action=logout-all            (invalidates every session via tokenVersion bump)
//   action=resend-verification   (re-sends the signup verification email)
export async function POST(request: Request) {
    const env = getServerEnv();
    const session = await getValidatedSession(request);
    if (!session) return NextResponse.redirect(new URL("/login", env.appUrl), 303);

    const repository = getRepository();
    const form = await request.formData();
    const action = String(form.get("action") ?? "");

    if (action === "change-password") {
        const currentPassword = String(form.get("currentPassword") ?? "");
        const newPassword = String(form.get("newPassword") ?? "");
        const user = await repository.findUserById(session.userId);
        if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
            return NextResponse.redirect(new URL("/profile?accountError=current", env.appUrl), 303);
        }
        if (newPassword.length < 12 || newPassword.length > 200) {
            return NextResponse.redirect(new URL("/profile?accountError=password", env.appUrl), 303);
        }
        await repository.updateUserPassword(session.userId, await hashPassword(newPassword));
        // Keep other devices' sessions valid; only this password changed.
        return NextResponse.redirect(new URL("/profile?accountSaved=password", env.appUrl), 303);
    }

    if (action === "resend-verification") {
        const user = await repository.findUserById(session.userId);
        if (!user) return NextResponse.redirect(new URL("/profile?accountError=unknown", env.appUrl), 303);
        if (user.emailVerifiedAt) {
            return NextResponse.redirect(new URL("/profile?accountSaved=already-verified", env.appUrl), 303);
        }
        resendVerificationLimiter ??= new LoginRateLimitStore(env.redisUrl, 3, 60 * 60 * 1_000);
        if (!(await resendVerificationLimiter.isAllowed(session.userId))) {
            return NextResponse.redirect(new URL("/profile?accountError=verify-rate-limited", env.appUrl), 303);
        }
        await resendVerificationLimiter.recordFailure(session.userId);
        const raw = await issueAuthToken(user.id, "EMAIL_VERIFY");
        await sendEmail(emailVerificationEmail(env.appUrl, `/api/auth/verify-email?token=${encodeURIComponent(raw)}`)(user.email))
            .catch(() => undefined);
        return NextResponse.redirect(new URL("/profile?accountSaved=verification-sent", env.appUrl), 303);
    }

    if (action === "logout-all") {
        await repository.bumpUserTokenVersion(session.userId);
        const response = NextResponse.redirect(new URL("/login?loggedOut=all", env.appUrl), 303);
        response.cookies.set({ name: sessionCookieName(env.appUrl), value: "", httpOnly: true, path: "/", maxAge: 0 });
        return response;
    }

    return NextResponse.redirect(new URL("/profile?accountError=unknown", env.appUrl), 303);
}
