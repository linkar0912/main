import Link from "next/link";
import { KeyRound } from "lucide-react";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";

export const metadata = { title: `Forgot password · ${PRODUCT_NAME}` };

export default async function ForgotPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ sent?: string }>;
}) {
    const params = await searchParams;
    return (
        <div data-header-tone="light">
            <MarketingHeader />
            <main className="auth-page-section" data-auth-tone="editorial">
                <div className="auth-page-frame">
                    <p className="eyebrow">Account recovery</p>
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
            <MarketingFooter hideWordmark />
        </div>
    );
}
