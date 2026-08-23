import Link from "next/link";
import { KeyRound } from "lucide-react";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { LinkarMark } from "@/src/components/linkar-mark";

export const metadata = { title: `Set a new password · ${PRODUCT_NAME}` };

function Card({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <main className="auth-shell">
            <section className="auth-hero grid-texture" aria-hidden>
                <div className="auth-hero-brand">
                    <span className="brand-mark"><LinkarMark size={20} /></span>
                    {PRODUCT_NAME}
                </div>
                <div className="auth-hero-copy">
                    <h1>Pick something strong.</h1>
                    <p>Twelve characters or more. A passphrase you have not used elsewhere works best.</p>
                </div>
                <p className="auth-hero-foot">Your other devices stay signed in.</p>
            </section>
            <section className="auth-main">
                <div className="login-card">
                    <div className="login-brand"><span className="brand-mark"><LinkarMark size={20} /></span><strong>{PRODUCT_NAME}</strong></div>
                    {children}
                </div>
            </section>
        </main>
    );
}

export default async function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string; error?: string }>;
}) {
    const params = await searchParams;
    const token = params.token ?? "";

    if (params.error === "invalid") {
        return (
            <Card>
                <p className="eyebrow">Account recovery</p>
                <h1>Reset link invalid</h1>
                <p className="muted">This reset link is invalid, already used, or expired.</p>
                <p><Link className="text-link" href="/forgot-password">Request a new link</Link></p>
            </Card>
        );
    }
    if (!token) {
        return (
            <Card>
                <p className="eyebrow">Account recovery</p>
                <h1>Set a new password</h1>
                <p className="muted">Open the reset link from your email to choose a new password.</p>
                <p><Link className="text-link" href="/forgot-password">Request a reset link</Link></p>
            </Card>
        );
    }

    return (
        <Card>
            <p className="eyebrow">Account recovery</p>
            <h1>Set a new password</h1>
            {params.error === "password" ? (
                <p role="alert">Passwords must be at least 12 characters.</p>
            ) : null}
            <form method="post" action="/api/auth/reset-password" className="login-form">
                <input type="hidden" name="token" value={token} />
                <label className="field" htmlFor="password"><span>New password</span>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        minLength={12}
                        maxLength={200}
                        autoComplete="new-password"
                    />
                </label>
                <button className="button button-primary" type="submit"><KeyRound size={15} /> Save new password</button>
            </form>
        </Card>
    );
}
