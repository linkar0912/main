import Link from "next/link";
import { PRODUCT_MARK, PRODUCT_NAME } from "@/src/lib/branding";
import { safeNextPath } from "@/src/lib/auth/session";

export const dynamic = "force-dynamic";

type SignupPageProps = {
    searchParams: Promise<{ error?: string; email?: string; next?: string; invite?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
    const params = await searchParams;
    const nextPath = safeNextPath(params.next || "/automations");
    const invite = typeof params.invite === "string" && params.invite.length <= 512 ? params.invite : "";
    const error = params.error === "email"
        ? "Enter a valid email address."
        : params.error === "password"
            ? "Choose a password with at least 12 characters."
            : params.error === "locked"
                ? "Too many signup attempts from this network. Try again later."
                : params.error === "invite"
                    ? "This invitation link is invalid, already used, or was sent to a different email."
                    : "";

    return (
        <main className="login-page">
            <section className="login-card">
                <div className="login-brand"><span className="brand-mark">{PRODUCT_MARK}</span><strong>{PRODUCT_NAME}</strong></div>
                <p className="eyebrow">{invite ? "Team invitation" : "Get started"}</p>
                <h1>{invite ? "Join your team's workspace." : "Create your workspace."}</h1>
                <p className="muted">{invite ? "Create your account with the invited email address to accept the invitation." : "One account, one Instagram, automations in minutes."}</p>
                {error && <p className="form-error" role="alert">{error}</p>}
                <form action="/api/auth/signup" method="post" className="login-form">
                    <input type="hidden" name="next" value={nextPath} />
                    {invite && <input type="hidden" name="invite" value={invite} />}
                    <label className="field"><span>Email</span><input name="email" type="email" autoComplete="username" defaultValue={params.email ?? ""} required /></label>
                    <label className="field"><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
                    <p className="muted">At least 12 characters.</p>
                    <button className="button button-primary" type="submit">Create account</button>
                </form>
                <p className="muted">Already have an account? <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</Link></p>
            </section>
        </main>
    );
}