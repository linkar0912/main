import Link from "next/link";
import {
  BadgeCheck,
  MessageCircleReply,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { InstagramGlyph } from "@/src/components/instagram-glyph";
import { safeNextPath } from "@/src/lib/auth/session";

export const dynamic = "force-dynamic";

type SignupPageProps = {
    searchParams: Promise<{ error?: string; email?: string; next?: string; invite?: string }>;
};

const HERO_POINTS = [
    { icon: Zap, text: "Launch your first keyword auto-reply in under five minutes." },
    { icon: MessageCircleReply, text: "Turn comments and story mentions into DM conversations." },
    { icon: ShieldCheck, text: "Official Meta APIs, transparent automations you fully control." },
];

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
        <main className="auth-shell">
            <section className="auth-hero" aria-hidden>
                <div className="auth-hero-brand">
                    <span className="brand-mark"><InstagramGlyph size={17} /></span>
                    {PRODUCT_NAME}
                </div>
                <div className="auth-hero-copy">
                    <h1>{invite ? "Join your team's workspace." : "Create your workspace in minutes."}</h1>
                    <p>
                        {invite
                            ? "Accept the invitation by signing up with the invited email address."
                            : "One account, one Instagram, automations live today — no code, no scrapers."}
                    </p>
                </div>
                <ul className="auth-points">
                    {HERO_POINTS.map(({ icon: Icon, text }) => (
                        <li key={text}>
                            <Icon size={15} />
                            <span>{text}</span>
                        </li>
                    ))}
                </ul>
                <p className="auth-hero-foot">Free plan included · No card required</p>
            </section>

            <section className="auth-main">
                <div className="login-card">
                    <div className="login-brand"><span className="brand-mark"><InstagramGlyph size={17} /></span><strong>{PRODUCT_NAME}</strong></div>
                    <p className="eyebrow">{invite ? "Team invitation" : "Get started"}</p>
                    <h1>{invite ? "Almost there." : "Create your account."}</h1>
                    <p className="muted">
                        {invite
                            ? "Sign up with the invited email to join the workspace."
                            : "Start free — upgrade when your audience grows."}
                    </p>
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
                    {!invite && (
                        <p className="muted"><BadgeCheck size={13} /> Free forever for your first 25 contacts.</p>
                    )}
                </div>
            </section>
        </main>
    );
}
