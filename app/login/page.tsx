import { PRODUCT_MARK, PRODUCT_NAME } from "@/src/lib/branding";
import { getOwnerAuthConfig, safeNextPath } from "@/src/lib/auth/session";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const configured = Boolean(getOwnerAuthConfig());
  const nextPath = safeNextPath(params.next);
  const error = params.error === "invalid"
    ? "That email or password is incorrect."
    : params.error === "not-configured"
      ? "Owner login is not configured on this server."
      : params.error === "locked"
        ? "Too many failed attempts. Wait fifteen minutes before trying again."
      : "";

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><span className="brand-mark">{PRODUCT_MARK}</span><strong>{PRODUCT_NAME}</strong></div>
        <p className="eyebrow">Owner workspace</p>
        <h1>Sign in to your control room.</h1>
        <p className="muted">This MVP is locked to one authorized owner account.</p>
        {!configured && <p className="form-error" role="alert">Set the owner authentication secrets before using this deployment.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <form action="/api/auth/login" method="post" className="login-form">
          <input type="hidden" name="next" value={nextPath} />
          <label className="field"><span>Email</span><input name="email" type="email" autoComplete="username" required /></label>
          <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button button-primary" type="submit" disabled={!configured}>Sign in</button>
        </form>
      </section>
    </main>
  );
}
