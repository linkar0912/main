import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { consumeAuthToken } from "@/src/lib/auth/tokens";
import { hashPassword } from "@/src/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const env = getServerEnv();
    const form = await request.formData();
    const token = String(form.get("token") ?? "");
    const password = String(form.get("password") ?? "");

    if (password.length < 12 || password.length > 200) {
        return NextResponse.redirect(
            new URL(`/reset-password?token=${encodeURIComponent(token)}&error=password`, env.appUrl),
            303,
        );
    }

    const consumed = await consumeAuthToken(token, "PASSWORD_RESET");
    if (!consumed) {
        return NextResponse.redirect(new URL("/reset-password?error=invalid", env.appUrl), 303);
    }

    const repository = getRepository();
    await repository.updateUserPassword(consumed.userId, await hashPassword(password));
    // Invalidate every existing session for this user, including the attacker's
    // if the account was compromised, then let them sign in fresh.
    await repository.bumpUserTokenVersion(consumed.userId);
    return NextResponse.redirect(new URL("/login?reset=1", env.appUrl), 303);
}