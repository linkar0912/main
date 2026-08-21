import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { issueAuthToken } from "@/src/lib/auth/tokens";
import { passwordResetEmail, sendEmail } from "@/src/lib/mailer";
import { LoginRateLimitStore } from "@/src/lib/auth/rate-limit";
import { clientAddress } from "@/src/lib/auth/client-address";

export const runtime = "nodejs";

let limiter: LoginRateLimitStore | undefined;

export async function POST(request: Request) {
    const env = getServerEnv();
    limiter ??= new LoginRateLimitStore(env.redisUrl);
    const address = clientAddress(request, env.trustedProxyHops);
    if (!(await limiter.isAllowed(address))) {
        return NextResponse.redirect(new URL("/forgot-password?sent=1", env.appUrl), 303);
    }
    await limiter.recordFailure(address);

    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const user = email ? await getRepository().findUserByEmail(email) : null;
    if (user) {
        const raw = await issueAuthToken(user.id, "PASSWORD_RESET");
        const template = passwordResetEmail(env.appUrl, `/reset-password?token=${encodeURIComponent(raw)}`);
        await sendEmail(template(user.email));
    }
    // Always the same response whether or not the account exists (no enumeration).
    return NextResponse.redirect(new URL("/forgot-password?sent=1", env.appUrl), 303);
}