import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { getRepository } from "@/src/lib/repository-provider";
import { safeNextPath } from "@/src/lib/auth/session";
import { authPageUrl, sanitizeInvite } from "@/src/lib/auth/auth-redirect";
import { completeOAuthSignIn } from "@/src/lib/auth/complete-oauth-signin";
import { parseEmailOtpType } from "@/src/lib/auth/email-otp";
import { pendingInviteFromUser } from "@/src/lib/auth/invitations";
import { createRecoveryProof, RECOVERY_PROOF_COOKIE, recoveryProofCookieOptions } from "@/src/lib/auth/recovery-proof";
import { rejectCrossSiteRequest } from "@/src/lib/security/same-origin";
import { applicationOriginForPath } from "@/src/lib/site-routing";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

// POST from the /auth/confirm interstitial. Uses verifyOtp(token_hash) rather
// than PKCE code exchange: the link is opened cold, often on a different
// device than the one that requested it, so there is no code-verifier cookie
// to exchange against.
export async function POST(request: Request) {
    const crossSite = rejectCrossSiteRequest(request);
    if (crossSite) return crossSite;

    const env = getServerEnv();
    const form = await request.formData();
    const tokenHash = String(form.get("token_hash") ?? "");
    const type = parseEmailOtpType(String(form.get("type") ?? ""));
    const next = safeNextPath(String(form.get("next") ?? ""));
    const invite = sanitizeInvite(String(form.get("invite") ?? ""));
    const failure = () => NextResponse.redirect(
        type === "recovery"
            ? new URL("/reset-password?error=invalid", env.appUrl)
            : authPageUrl("/login", { verify: "invalid", next, invite }, env.appUrl),
        303,
    );

    if (!tokenHash || !type || tokenHash.length > 512) return failure();

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.user) return failure();

    if (type === "recovery") {
        // The reset form only accepts a session that comes with this proof,
        // bound to the recovering user and valid for 15 minutes.
        const response = NextResponse.redirect(new URL("/reset-password", env.appUrl), 303);
        response.cookies.set(
            RECOVERY_PROOF_COOKIE,
            createRecoveryProof(data.user.id, env.authSessionSecret),
            recoveryProofCookieOptions(env.appUrl),
        );
        return response;
    }

    // The email address is verified from this point on, so this is where a
    // password signup's workspace is provisioned or its invitation accepted
    // (signup itself no longer does either). A returning user just resolves to
    // their existing workspace.
    if (data.user.email) {
        try {
            await completeOAuthSignIn({
                email: data.user.email,
                userId: data.user.id,
                inviteRaw: invite || pendingInviteFromUser(data.user),
                repository: getRepository(),
            });
        } catch (provisionError) {
            // Not fatal: the first password sign-in retries provisioning.
            logger.error("Workspace provisioning after email confirmation failed", {
                error: provisionError instanceof Error ? provisionError.message : String(provisionError),
            });
        }
    }
    return NextResponse.redirect(new URL(next, applicationOriginForPath(next, env)), 303);
}
