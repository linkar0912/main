import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";
import { getServerEnv } from "@/src/lib/env";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";
import { OAuthButtons } from "@/src/components/auth/oauth-buttons";
import { AuthLegalNotice } from "@/src/components/auth/legal-notice";
import { SubmitButton } from "@/src/components/auth/submit-button";
import { sanitizeInvite } from "@/src/lib/auth/auth-redirect";
import { safeNextPath } from "@/src/lib/auth/session";
import { BILLING_PLANS } from "@/src/lib/billing/catalog";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: `Create your account · ${PRODUCT_NAME}`,
    robots: { index: false, follow: false },
};

type SignupPageProps = {
    searchParams: Promise<{ error?: string; email?: string; next?: string; invite?: string; sent?: string; notice?: string; plan?: string }>;
};

/**
 * The paid plan a visitor picked on /pricing, if any. Every workspace starts on
 * Free and upgrades from Settings, so the choice is acknowledged rather than
 * silently dropped.
 */
function chosenPlanName(plan: string | undefined): string | null {
    if (!plan || !Object.hasOwn(BILLING_PLANS, plan)) return null;
    return BILLING_PLANS[plan as keyof typeof BILLING_PLANS].name;
}

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
                        ? "Something went wrong creating your account. Please try again."
                        : params.error === "oauth"
                            ? "Something went wrong signing in. Please try again."
                            : "";
    const emailError = params.error === "email" || params.error === "invite";
    const passwordError = params.error === "password";
    const planName = invite ? null : chosenPlanName(params.plan);

    return (
        <div data-header-tone="light">
            <MarketingHeader siteOrigin={publicSiteUrl} />
            <main className="auth-page-section" data-auth-tone="editorial">
                <div className="auth-page-frame">
                    <h1>{invite ? "Almost there." : "Create your account."}</h1>
                    <p className="auth-page-lede">
                        {invite
                            ? "Sign up with the invited email to join the workspace."
                            : "Start free, then upgrade when your audience grows."}
                    </p>
                    {planName && (
                        <p role="status">
                            You picked the {planName} plan. Every account starts on Free; switch to {planName} in Settings, under Billing, once you are in.
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
