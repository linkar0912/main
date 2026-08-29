import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { LoginRateLimitStore } from "@/src/lib/auth/rate-limit";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

// Resend attempts per user per hour. A separate, tighter limiter than login's -
// this only ever sends mail to the account's own verified-pending address.
let resendVerificationLimiter: LoginRateLimitStore | undefined;

// GET /api/account - identity for the signed-in user (sidebar chip, profile).
export async function GET(request: Request) {
    const session = await getValidatedSession(request);
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) return Response.json({ error: "Account not found" }, { status: 404 });

    const repository = getRepository();
    const role = await repository.getMemberRole(session.workspaceId, data.user.email);

    return Response.json({
        data: {
            id: session.userId,
            email: data.user.email,
            workspaceId: session.workspaceId,
            role: role ?? "MEMBER",
            plan: "free",
            memberSince: data.user.created_at,
            emailVerified: Boolean(data.user.email_confirmed_at),
        },
    });
}

// POST /api/account - form actions for the signed-in user:
//   action=change-password       (currentPassword, newPassword)
//   action=logout-all            (invalidates every session)
//   action=resend-verification   (re-sends the signup confirmation email)
export async function POST(request: Request) {
    const env = getServerEnv();
    const session = await getValidatedSession(request);
    if (!session) return NextResponse.redirect(new URL("/login", env.appUrl), 303);

    const form = await request.formData();
    const action = String(form.get("action") ?? "");
    const supabase = await createSupabaseServerClient();

    if (action === "change-password") {
        const currentPassword = String(form.get("currentPassword") ?? "");
        const newPassword = String(form.get("newPassword") ?? "");
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.email) {
            return NextResponse.redirect(new URL("/profile?accountError=current", env.appUrl), 303);
        }
        // supabase-js has no direct "verify current password" call; re-authenticating
        // with it both confirms it and keeps the session valid for updateUser below.
        const { error: verifyError } = await supabase.auth.signInWithPassword({
            email: userData.user.email,
            password: currentPassword,
        });
        if (verifyError) {
            return NextResponse.redirect(new URL("/profile?accountError=current", env.appUrl), 303);
        }
        if (newPassword.length < 12 || newPassword.length > 200) {
            return NextResponse.redirect(new URL("/profile?accountError=password", env.appUrl), 303);
        }
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) {
            return NextResponse.redirect(new URL("/profile?accountError=password", env.appUrl), 303);
        }
        // Keep other devices' sessions valid; only this password changed.
        return NextResponse.redirect(new URL("/profile?accountSaved=password", env.appUrl), 303);
    }

    if (action === "resend-verification") {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user?.email) return NextResponse.redirect(new URL("/profile?accountError=unknown", env.appUrl), 303);
        if (userData.user.email_confirmed_at) {
            return NextResponse.redirect(new URL("/profile?accountSaved=already-verified", env.appUrl), 303);
        }
        resendVerificationLimiter ??= new LoginRateLimitStore(env.redisUrl, 3, 60 * 60 * 1_000);
        if (!(await resendVerificationLimiter.isAllowed(session.userId))) {
            return NextResponse.redirect(new URL("/profile?accountError=verify-rate-limited", env.appUrl), 303);
        }
        await resendVerificationLimiter.recordFailure(session.userId);
        const confirmUrl = new URL("/auth/confirm", env.appUrl);
        confirmUrl.searchParams.set("type", "signup");
        await supabase.auth.resend({
            type: "signup",
            email: userData.user.email,
            options: { emailRedirectTo: confirmUrl.toString() },
        }).catch(() => undefined);
        return NextResponse.redirect(new URL("/profile?accountSaved=verification-sent", env.appUrl), 303);
    }

    if (action === "logout-all") {
        await supabase.auth.signOut({ scope: "global" });
        return NextResponse.redirect(new URL("/login?loggedOut=all", env.appUrl), 303);
    }

    return NextResponse.redirect(new URL("/profile?accountError=unknown", env.appUrl), 303);
}
