import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { getValidatedSession, hashPassword, verifyPassword } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

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
            return NextResponse.redirect(new URL("/settings?accountError=current", env.appUrl), 303);
        }
        if (newPassword.length < 12 || newPassword.length > 200) {
            return NextResponse.redirect(new URL("/settings?accountError=password", env.appUrl), 303);
        }
        await repository.updateUserPassword(session.userId, await hashPassword(newPassword));
        // Keep other devices' sessions valid; only this password changed.
        return NextResponse.redirect(new URL("/settings?accountSaved=password", env.appUrl), 303);
    }

    if (action === "logout-all") {
        await repository.bumpUserTokenVersion(session.userId);
        const response = NextResponse.redirect(new URL("/login?loggedOut=all", env.appUrl), 303);
        response.cookies.set({ name: sessionCookieNameFor(env), value: "", httpOnly: true, path: "/", maxAge: 0 });
        return response;
    }

    return NextResponse.redirect(new URL("/settings?accountError=unknown", env.appUrl), 303);
}

function sessionCookieNameFor(env: ReturnType<typeof getServerEnv>): string {
    return env.appUrl.startsWith("https://") ? "__Host-replyconnect_session" : "replyconnect_session";
}