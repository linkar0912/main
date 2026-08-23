import Link from "next/link";
import { KeyRound } from "lucide-react";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { LinkarMark } from "@/src/components/linkar-mark";

export const metadata = { title: `Forgot password · ${PRODUCT_NAME}` };

export default async function ForgotPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ sent?: string }>;
}) {
    const params = await searchParams;
    return (
        <main className="auth-shell">
            <section className="auth-hero" aria-hidden>
                <div className="auth-hero-brand">
                    <span className="brand-mark"><LinkarMark size={20} /></span>
                    {PRODUCT_NAME}
                </div>
                <div className="auth-hero-copy">
                    <h1>Locked out? It happens.</h1>
                    <p>Request a reset link and you are back in your control room within minutes.</p>
                </div>
                <p className="auth-hero-foot">Reset links expire after one hour.</p>
            </section>
            <section className="auth-main">
                <div className="login-card">
                    <div className="login-brand"><span className="brand-mark"><LinkarMark size={20} /></span><strong>{PRODUCT_NAME}</strong></div>
                    <p className="eyebrow">Account recovery</p>
                    <h1>Reset your password</h1>
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
                    <p className="muted">Remembered it? <Link href="/login">Back to login</Link></p>
                </div>
            </section>
        </main>
    );
}
