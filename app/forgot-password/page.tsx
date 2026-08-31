import Link from "next/link";
import { KeyRound } from "lucide-react";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";
import { getServerEnv } from "@/src/lib/env";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";

// force-dynamic is required, not vestigial: the marketing chrome needs
// publicSiteUrl, which is read from the environment at request time so Coolify's
// value is used rather than whatever the Docker image was built with. Without
// this the page is prerendered, getServerEnv() runs during the build, and env
// validation fails there. /login and /signup are force-dynamic for the same
// reason.
export const dynamic = "force-dynamic";

export const metadata = { title: `Forgot password · ${PRODUCT_NAME}` };

export default async function ForgotPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ sent?: string }>;
}) {
    // Served from the app host, so the marketing chrome needs the marketing
    // origin; a relative link would resolve against the app host and bounce
    // straight back to /login.
    const { publicSiteUrl } = getServerEnv();
    const params = await searchParams;
    return (
        <div data-header-tone="light">
            <MarketingHeader siteOrigin={publicSiteUrl} />
            <main className="auth-page-section" data-auth-tone="editorial">
                <div className="auth-page-frame">
                    <h1>Reset your password</h1>
                    <p className="auth-page-lede">
                        Request a reset link and you will be back in your control room within minutes.
                    </p>
                    {params.sent ? (
                        <p role="status">
                            If an account exists for that email, a reset link is on its way. The link expires in one hour.
                        </p>
                    ) : (
                        <form method="post" action="/api/auth/forgot-password" className="login-form">
                            <label className="field" htmlFor="email"><span>Email</span>
                                <input id="email" name="email" type="email" required autoComplete="email" />
                            </label>
                            <button className="button button-primary" type="submit"><KeyRound size={15} /> Send reset link</button>
                        </form>
                    )}
                    <p className="auth-page-foot">Remembered it? <Link href="/login">Back to login</Link></p>
                </div>
            </main>
            <MarketingFooter siteOrigin={publicSiteUrl} />
        </div>
    );
}
