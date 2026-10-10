import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { getRepository } from "@/src/lib/repository-provider";
import { sessionRevocationInstant } from "@/src/lib/auth/session";
import { RECOVERY_PROOF_COOKIE, readRecoveryProof, recoveryProofCookieOptions } from "@/src/lib/auth/recovery-proof";
import { rejectCrossSiteRequest } from "@/src/lib/security/same-origin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

function resetPage(error: string, appUrl: string): NextResponse {
    return NextResponse.redirect(new URL(`/reset-password?error=${error}`, appUrl), 303);
}

export async function POST(request: NextRequest) {
    const crossSite = rejectCrossSiteRequest(request);
    if (crossSite) return crossSite;

    const env = getServerEnv();
    const form = await request.formData();
    const password = String(form.get("password") ?? "");

    if (password.length < 12 || password.length > 200) return resetPage("password", env.appUrl);

    // A signed-in session alone is not enough to set a new password without
    // the current one: it must be the session /auth/confirm created from a
    // recovery link in this browser, within the last 15 minutes. Otherwise a
    // stolen or unattended session could take over the account.
    const supabase = await createSupabaseServerClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
    const proofUserId = readRecoveryProof(request.cookies.get(RECOVERY_PROOF_COOKIE)?.value, env.authSessionSecret);
    if (!userId || !proofUserId || proofUserId !== userId) return resetPage("invalid", env.appUrl);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
        if (error.code === "same_password") return resetPage("same", env.appUrl);
        if (error.code === "weak_password") return resetPage("weak", env.appUrl);
        logger.warn("Password reset updateUser failed", { code: error.code ?? "unknown" });
        return resetPage("invalid", env.appUrl);
    }

    // Invalidate every session for this user, including the attacker's if the
    // account was compromised and including the one just used to reset it,
    // then let them sign in fresh. signOut revokes refresh tokens; the
    // revocation instant also rejects access tokens that were already issued.
    await getRepository().revokeUserSessions(userId, sessionRevocationInstant());
    await supabase.auth.signOut({ scope: "global" });
    const response = NextResponse.redirect(new URL("/login?reset=1", env.appUrl), 303);
    response.cookies.set(RECOVERY_PROOF_COOKIE, "", { ...recoveryProofCookieOptions(env.appUrl), maxAge: 0 });
    return response;
}
