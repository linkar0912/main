import Link from "next/link";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";
import { getServerEnv } from "@/src/lib/env";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";
import { OAuthButtons } from "@/src/components/auth/oauth-buttons";
import { safeNextPath } from "@/src/lib/auth/session";

export const dynamic = "force-dynamic";

type SignupPageProps = {
    searchParams: Promise<{ error?: string; email?: string; next?: string; invite?: string; sent?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
    // Served from the app host, so the marketing chrome needs the marketing
    // origin; a relative link would resolve against the app host and bounce
    // straight back to /login.
    const { publicSiteUrl } = getServerEnv();
    const params = await searchParams;
    const nextPath = safeNextPath(params.next || "/automations");
    const invite = typeof params.invite === "string" && params.invite.length <= 512 ? params.invite : "";

    if (params.sent === "1") {
        return (
            <div data-header-tone="light">
                <MarketingHeader siteOrigin={publicSiteUrl} />
                <main className="auth-page-section" data-auth-tone="editorial">
                    <div className="auth-page-frame">
                        <h1>Check your email</h1>
                        <p className="auth-page-lede">
                            We sent a confirmation link. Open it to finish creating your account.
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

    return (
        <div data-header-tone="light">
            <MarketingHeader siteOrigin={publicSiteUrl} />
            <main className="auth-page-section" data-auth-tone="editorial">
                <div className="auth-page-frame">
                    <h1>{invite ? "Almost there." : "Create your account."}</h1>
                    <p className="auth-page-lede">
                        {invite
                            ? "Sign up with the invited email to join the workspace."
                            : "Start free - upgrade when your audience grows."}
                    </p>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <OAuthButtons next={nextPath} invite={invite} />
                    <p className="auth-page-divider"><span>or</span></p>
                    <form action="/api/auth/signup" method="post" className="login-form">
                        <input type="hidden" name="next" value={nextPath} />
                        {invite && <input type="hidden" name="invite" value={invite} />}
                        <label className="field"><span>Email</span><input name="email" type="email" autoComplete="username" defaultValue={params.email ?? ""} required /></label>
                        <label className="field"><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
                        <p className="auth-page-hint">At least 12 characters.</p>
                        <button className="button button-primary" type="submit">Create account</button>
                    </form>
                    <p className="auth-page-foot">
                        Already have an account? <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</Link>
                    </p>
                </div>
            </main>
            <MarketingFooter siteOrigin={publicSiteUrl} />
        </div>
    );
}
