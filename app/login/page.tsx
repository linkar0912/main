import Link from "next/link";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { InstagramGlyph } from "@/src/components/instagram-glyph";
import { safeNextPath } from "@/src/lib/auth/session";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

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
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><span className="brand-mark"><InstagramGlyph size={17} /></span><strong>{PRODUCT_NAME}</strong></div>
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to your control room.</h1>
        <p className="muted">Connect your Instagram and automate replies.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <form action="/api/auth/login" method="post" className="login-form">
          <input type="hidden" name="next" value={nextPath} />
          <label className="field"><span>Email</span><input name="email" type="email" autoComplete="username" required /></label>
          <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button button-primary" type="submit">Sign in</button>
        </form>
        <p className="muted">New here? <Link href={`/signup?next=${encodeURIComponent(nextPath)}`}>Create an account</Link></p>
      </section>
    </main>
  );
}