import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";
import { getServerEnv } from "@/src/lib/env";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";
import { OAuthButtons } from "@/src/components/auth/oauth-buttons";
import { AuthLegalNotice } from "@/src/components/auth/legal-notice";
import { SubmitButton } from "@/src/components/auth/submit-button";
import { ClearOnboardingFlags } from "@/src/components/auth/clear-onboarding-flags";
import { sanitizeInvite } from "@/src/lib/auth/auth-redirect";
import { safeNextPath } from "@/src/lib/auth/session";
import { describePlanIntent, parsePlanIntent, PLAN_INTENT_COOKIE, readPlanIntent } from "@/src/lib/billing/plan-intent";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: `Create your account · ${PRODUCT_NAME}`,
    robots: { index: false, follow: false },
};

type SignupPageProps = {
    searchParams: Promise<{ error?: string; email?: string; next?: string; invite?: string; sent?: string; notice?: string; plan?: string; interval?: string }>;
};


function withContext(path: string, nextPath: string, invite: string): string {
    const params = new URLSearchParams({ next: nextPath });
    if (invite) params.set("invite", invite);
    return `${path}?${params.toString()}`;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
    // Served from the app host, so the marketing chrome needs the marketing
    // origin; a relative link would resolve against the app host and bounce
    // straight back to /login.
    const { publicSiteUrl } = getServerEnv();
    const params = await searchParams;
    const nextPath = safeNextPath(params.next || "/automations");
    const invite = sanitizeInvite(params.invite);
    const email = typeof params.email === "string" && params.email.length <= 320 ? params.email : "";

    if (params.sent === "1") {
        const sentError = params.error === "resend-locked"
            ? "Too many confirmation emails requested. Try again in an hour."
            : "";
        return (
            <div data-header-tone="light">
                <ClearOnboardingFlags />
                <MarketingHeader siteOrigin={publicSiteUrl} />
                <main className="auth-page-section" data-auth-tone="editorial">
                    <div className="auth-page-frame">
                        <h1>Check your email</h1>
                        <p className="auth-page-lede">
                            We sent a confirmation link{email ? <> to <strong>{email}</strong></> : null}. Open it to finish creating your account.
                        </p>
                        {params.notice === "resent" && <p role="status">A new confirmation link is on its way.</p>}
                        {sentError && <p className="form-error" role="alert">{sentError}</p>}
                        {email && (
                            <form action="/api/auth/resend-confirmation" method="post" className="login-form" aria-label="Resend confirmation email">
                                <input type="hidden" name="email" value={email} />
                                <input type="hidden" name="next" value={nextPath} />
                                <input type="hidden" name="from" value="signup" />
                                {invite && <input type="hidden" name="invite" value={invite} />}
                                <SubmitButton className="button button-secondary" pendingLabel="Sending...">Resend the email</SubmitButton>
                            </form>
                        )}
                        <p className="auth-page-foot">
                            Wrong email? <Link href={withContext("/signup", nextPath, invite)} prefetch={false}>Start over</Link>
                        </p>
                    </div>
                </main>
                <MarketingFooter siteOrigin={publicSiteUrl} />
            </div>
        );
    }

    const error = params.error === "email"
        ? "Enter a valid email address."
        : params.error === "password"
            ? "Choose a password with at least 12 characters."
            : params.error === "locked"
                ? "Too many signup attempts from this network. Try again later."
                : params.error === "invite"
                    ? "This invitation link is invalid, already used, or was sent to a different email."
                    : params.error === "unknown"
                        ? "Your account could not be created just now. Try again in a moment."
                        : params.error === "oauth"
                            ? "Signing in with Google or Facebook did not finish. Try again, or use your email and password."
                            : "";
    const emailError = params.error === "email" || params.error === "invite";
    const passwordError = params.error === "password";
    // The paid plan picked on /pricing (the proxy remembers it in a cookie,
    // which also keeps it on an error re-render without the query). Every
    // workspace starts on Free; checkout opens once onboarding is done.
    // Invitations join someone else's workspace, so they never carry one.
    const planIntent = invite
        ? null
        : parsePlanIntent(params.plan, params.interval) ?? readPlanIntent((await cookies()).get(PLAN_INTENT_COOKIE)?.value);

    return (
        <div data-header-tone="light">
            {/* A new account on this tab must not inherit the last one's onboarding flags. */}
            <ClearOnboardingFlags />
            <MarketingHeader siteOrigin={publicSiteUrl} />
            <main className="auth-page-section" data-auth-tone="editorial">
                <div className="auth-page-frame">
                    <h1>{invite ? "Almost there." : "Create your account."}</h1>
                    <p className="auth-page-lede">
                        {invite
                            ? "Sign up with the invited email to join the workspace."
                            : "Start free, then upgrade when your audience grows."}
                    </p>
                    {planIntent && (
                        <p role="status">
                            You picked the {describePlanIntent(planIntent)}. After a quick setup, we will take you to checkout.
                        </p>
                    )}
                    {error && <p className="form-error" role="alert" id="signup-error">{error}</p>}
                    <AuthLegalNotice siteOrigin={publicSiteUrl} />
                    <OAuthButtons next={nextPath} invite={invite} />
                    <p className="auth-page-divider"><span>or</span></p>
                    <form action="/api/auth/signup" method="post" className="login-form" aria-label="Create your account">
                        <input type="hidden" name="next" value={nextPath} />
                        {invite && <input type="hidden" name="invite" value={invite} />}
                        <label className="field"><span>Email</span>
                            <input
                                name="email"
                                type="email"
                                autoComplete="username"
                                defaultValue={email}
                                required
                                aria-invalid={emailError || undefined}
                                aria-describedby={emailError ? "signup-error" : undefined}
                            />
                        </label>
                        <label className="field"><span>Password</span>
                            <input
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                minLength={12}
                                required
                                aria-invalid={passwordError || undefined}
                                aria-describedby={passwordError ? "signup-password-rules signup-error" : "signup-password-rules"}
                            />
                        </label>
                        <p className="auth-page-hint" id="signup-password-rules">At least 12 characters.</p>
                        <SubmitButton pendingLabel="Creating account...">Create account</SubmitButton>
                    </form>
                    <p className="auth-page-foot">
                        Already have an account? <Link href={withContext("/login", nextPath, invite)} prefetch={false}>Sign in</Link>
                    </p>
                </div>
            </main>
            <MarketingFooter siteOrigin={publicSiteUrl} />
        </div>
    );
}
