import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { getValidatedSession, hashPassword, verifyPassword } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

// GET /api/account — identity for the signed-in user (sidebar chip, profile).
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

// POST /api/account — form actions for the signed-in user:
//   action=change-password  (currentPassword, newPassword)
//   action=logout-all       (invalidates every session via tokenVersion bump)
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

    if (action === "logout-all") {
        await repository.bumpUserTokenVersion(session.userId);
        const response = NextResponse.redirect(new URL("/login?loggedOut=all", env.appUrl), 303);
        response.cookies.set({ name: sessionCookieNameFor(env), value: "", httpOnly: true, path: "/", maxAge: 0 });
        return response;
    }

    return NextResponse.redirect(new URL("/profile?accountError=unknown", env.appUrl), 303);
}

function sessionCookieNameFor(env: ReturnType<typeof getServerEnv>): string {
    return env.appUrl.startsWith("https://") ? "__Host-replyconnect_session" : "replyconnect_session";
}
