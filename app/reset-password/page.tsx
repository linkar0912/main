import Link from "next/link";
import { KeyRound } from "lucide-react";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const metadata = { title: `Set a new password · ${PRODUCT_NAME}` };

function Card({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <div data-header-tone="light">
            <MarketingHeader />
            <main className="auth-page-section" data-auth-tone="editorial">
                <div className="auth-page-frame">
                    {children}
                </div>
            </main>
            <MarketingFooter />
        </div>
    );
}

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

    // Reaching this page with a session means the recovery link was already
    // verified by /auth/confirm; without one, only /forgot-password can get
    // the user here for real.
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) {
        return (
            <Card>
                <h1>Set a new password</h1>
                <p className="auth-page-lede">Open the reset link from your email to choose a new password.</p>
                <p className="auth-page-foot"><Link className="text-link" href="/forgot-password">Request a reset link</Link></p>
            </Card>
        );
    }

    return (
        <Card>
            <h1>Set a new password</h1>
            <p className="auth-page-lede">Twelve characters or more. A passphrase you have not used elsewhere works best.</p>
            {params.error === "password" ? (
                <p className="form-error" role="alert">Passwords must be at least 12 characters.</p>
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
                    />
                </label>
                <button className="button button-primary" type="submit"><KeyRound size={15} /> Save new password</button>
            </form>
            <p className="auth-page-foot">You&apos;ll need to sign in again on every device after this.</p>
        </Card>
    );
}
