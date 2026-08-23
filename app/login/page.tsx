import Link from "next/link";
import {
  ArrowRight,
  MessageCircleReply,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/src/lib/branding";
import { LinkarMark } from "@/src/components/linkar-mark";
import { safeNextPath } from "@/src/lib/auth/session";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

const HERO_POINTS = [
  { icon: Zap, text: "Auto-reply to comments and DMs in seconds, around the clock." },
  { icon: MessageCircleReply, text: "Follow-gated campaigns that turn comments into qualified leads." },
  { icon: ShieldCheck, text: "Built on Meta's official APIs — no scraping, no gray areas." },
];

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const error = params.error === "invalid"
    ? "That email or password is incorrect."
    : params.error === "exists"
      ? "An account with that email already exists. Sign in instead."
      : params.error === "locked"
        ? "Too many failed attempts. Wait fifteen minutes before trying again."
        : "";

  return (
    <main className="auth-shell">
      <section className="auth-hero grid-texture" aria-hidden>
        <div className="auth-hero-brand">
          <span className="brand-mark"><LinkarMark size={20} /></span>
          {PRODUCT_NAME}
        </div>
        <div className="auth-hero-copy">
          <h1>Welcome back to your control room.</h1>
          <p>Connect Instagram once, and let automations carry the conversation while you create.</p>
        </div>
        <ul className="auth-points">
          {HERO_POINTS.map(({ icon: Icon, text }) => (
            <li key={text}>
              <Icon size={15} />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="auth-hero-foot">{PRODUCT_TAGLINE}</p>
      </section>

      <section className="auth-main">
        <div className="login-card">
          <div className="login-brand"><span className="brand-mark"><LinkarMark size={20} /></span><strong>{PRODUCT_NAME}</strong></div>
          <p className="eyebrow">Welcome back</p>
          <h1>Sign in.</h1>
          <p className="muted">Good to see you again — your flows missed you.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <form action="/api/auth/login" method="post" className="login-form">
            <input type="hidden" name="next" value={nextPath} />
            <label className="field"><span>Email</span><input name="email" type="email" autoComplete="username" required /></label>
            <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
            <button className="button button-primary" type="submit">Sign in</button>
          </form>
          <p className="muted">New here? <Link href={`/signup?next=${encodeURIComponent(nextPath)}`}>Create an account</Link></p>
          <p className="muted"><Link href="/forgot-password">Forgot your password? <ArrowRight size={12} /></Link></p>
        </div>
      </section>
    </main>
  );
}