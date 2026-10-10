import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";
import { OAuthButtons } from "@/src/components/auth/oauth-buttons";
import { AuthLegalNotice } from "@/src/components/auth/legal-notice";
import { SubmitButton } from "@/src/components/auth/submit-button";
import { getServerEnv } from "@/src/lib/env";

type LoginScreenProps = {
  nextPath: string;
  invite?: string;
  error?: string;
  notice?: string;
  /**
   * Offer "Resend confirmation email" (signed out). A string pre-fills the
   * address; true asks for it.
   */
  resend?: string | true;
};

function withContext(path: string, nextPath: string, invite?: string): string {
  const params = new URLSearchParams({ next: nextPath });
  if (invite) params.set("invite", invite);
  return `${path}?${params.toString()}`;
}

export function LoginScreen({ nextPath, invite, error, notice, resend }: LoginScreenProps) {
  // This screen is served from the app host, so the marketing chrome needs the
  // marketing origin or its links resolve against the app host and bounce back
  // here (app.linkar.in/ -> /dashboard -> /login).
  const { publicSiteUrl } = getServerEnv();
  return (
    <div data-header-tone="light">
      <MarketingHeader siteOrigin={publicSiteUrl} />
      <main className="auth-page-section" data-login-layout="conversation-desk" data-auth-tone="editorial">
        <div className="auth-page-frame">
          <h1>Keep the right conversations moving.</h1>
          <p className="auth-page-lede">
            Pick up where your flows left off, with every useful next step close at hand.
          </p>

          {notice && <p role="status">{notice}</p>}
          {error && <p className="form-error" role="alert" id="login-error">{error}</p>}

          {resend && (
            <form action="/api/auth/resend-confirmation" method="post" className="login-form" aria-label="Resend confirmation email">
              <input type="hidden" name="next" value={nextPath} />
              {invite && <input type="hidden" name="invite" value={invite} />}
              {typeof resend === "string" ? (
                <input type="hidden" name="email" value={resend} />
              ) : (
                <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
              )}
              <SubmitButton className="button button-secondary" pendingLabel="Sending...">Resend confirmation email</SubmitButton>
            </form>
          )}

          <AuthLegalNotice siteOrigin={publicSiteUrl} />
          <OAuthButtons next={nextPath} invite={invite} />
          <p className="auth-page-divider"><span>or</span></p>

          <form
            action="/api/auth/login"
            method="post"
            className="login-form"
            aria-label="Sign in to Linkar"
          >
            <input type="hidden" name="next" value={nextPath} />
            {invite && <input type="hidden" name="invite" value={invite} />}
            <label className="field"><span>Email</span><input name="email" type="email" autoComplete="username" required aria-describedby={error ? "login-error" : undefined} /></label>
            <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required aria-describedby={error ? "login-error" : undefined} /></label>
            <SubmitButton pendingLabel="Signing in..." style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span>Sign in</span>
              <ArrowRight size={16} aria-hidden="true" />
            </SubmitButton>
          </form>

          <p className="auth-page-foot">
            New here? <Link href={withContext("/signup", nextPath, invite)} prefetch={false}>Create an account</Link>
          </p>
          <p className="auth-page-foot">
            <Link href="/forgot-password" className="auth-page-foot-link" prefetch={false}>
              Forgot your password?
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </p>
        </div>
      </main>
      <MarketingFooter siteOrigin={publicSiteUrl} />
    </div>
  );
}
