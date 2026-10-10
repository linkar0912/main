import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { KeyRound } from "lucide-react";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";
import { getServerEnv } from "@/src/lib/env";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";
import { SubmitButton } from "@/src/components/auth/submit-button";
import { RECOVERY_PROOF_COOKIE, readRecoveryProof } from "@/src/lib/auth/recovery-proof";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

// force-dynamic is required, not vestigial: the marketing chrome needs
// publicSiteUrl, which is read from the environment at request time so the deployment's
// value is used rather than whatever the Docker image was built with. Without
// this the page is prerendered, getServerEnv() runs during the build, and env
// validation fails there. /login and /signup are force-dynamic for the same
// reason.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: `Set a new password · ${PRODUCT_NAME}`,
    robots: { index: false, follow: false },
};

function Card({ children }: Readonly<{ children: React.ReactNode }>) {
    // Served from the app host; see the note on the other auth screens.
    const { publicSiteUrl } = getServerEnv();
    return (
        <div data-header-tone="light">
            <MarketingHeader siteOrigin={publicSiteUrl} />
            <main className="auth-page-section" data-auth-tone="editorial">
                <div className="auth-page-frame">
                    {children}
                </div>
            </main>
            <MarketingFooter siteOrigin={publicSiteUrl} />
        </div>
    );
}

const FORM_ERRORS: Record<string, string> = {
    password: "Passwords must be at least 12 characters.",
    weak: "That password is too easy to guess. Choose a longer or less common one.",
    same: "Your new password must be different from your current one.",
};

export default async function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const params = await searchParams;

    if (params.error === "invalid") {
        return (
            <Card>
                <h1>Reset link invalid</h1>
                <p className="auth-page-lede">This reset link is invalid, already used, or expired.</p>
                <p className="auth-page-foot"><Link className="text-link" href="/forgot-password">Request a new link</Link></p>
            </Card>
        );
    }

    // The form is only offered to the session /auth/confirm created from a
    // recovery link in this browser (it set the signed recovery proof). Any
    // other signed-in session must change its password from the profile page,
    // which asks for the current password.
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    const proofUserId = userId
        ? readRecoveryProof((await cookies()).get(RECOVERY_PROOF_COOKIE)?.value, getServerEnv().authSessionSecret)
        : null;
    if (!userId || proofUserId !== userId) {
        return (
            <Card>
                <h1>Set a new password</h1>
                <p className="auth-page-lede">Open the reset link from your email to choose a new password. Reset links work for 15 minutes after you open them.</p>
                <p className="auth-page-foot"><Link className="text-link" href="/forgot-password">Request a reset link</Link></p>
            </Card>
        );
    }

    const formError = FORM_ERRORS[params.error ?? ""] ?? "";
    return (
        <Card>
            <h1>Set a new password</h1>
            <p className="auth-page-lede" id="reset-password-rules">Twelve characters or more. A passphrase you have not used elsewhere works best.</p>
            {formError ? (
                <p className="form-error" role="alert" id="reset-password-error">{formError}</p>
            ) : null}
            <form method="post" action="/api/auth/reset-password" className="login-form">
                <label className="field" htmlFor="password"><span>New password</span>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        minLength={12}
                        maxLength={200}
                        autoComplete="new-password"
                        aria-invalid={formError ? true : undefined}
                        aria-describedby={formError ? "reset-password-rules reset-password-error" : "reset-password-rules"}
                    />
                </label>
                <SubmitButton pendingLabel="Saving..."><KeyRound size={15} /> Save new password</SubmitButton>
            </form>
            <p className="auth-page-foot">You&apos;ll need to sign in again on every device after this.</p>
        </Card>
    );
}
