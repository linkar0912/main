import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";

type LoginScreenProps = {
  nextPath: string;
  error?: string;
};

export function LoginScreen({ nextPath, error }: LoginScreenProps) {
  return (
    <div data-header-tone="light">
      <MarketingHeader />
      <main className="auth-page-section" data-login-layout="conversation-desk" data-auth-tone="editorial">
        <div className="auth-page-frame">
          <p className="eyebrow">Welcome back</p>
          <h1>Keep the right conversations moving.</h1>
          <p className="auth-page-lede">
            Pick up where your flows left off, with every useful next step close at hand.
          </p>

          {error && <p className="form-error" role="alert">{error}</p>}

          <form
            action="/api/auth/login"
            method="post"
            className="login-form"
            aria-label="Sign in to Linkar"
          >
            <input type="hidden" name="next" value={nextPath} />
            <label className="field"><span>Email</span><input name="email" type="email" autoComplete="username" required /></label>
            <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
            <button className="button button-primary" type="submit" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span>Sign in</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>

          <p className="auth-page-foot">
            New here? <Link href={`/signup?next=${encodeURIComponent(nextPath)}`}>Create an account</Link>
          </p>
          <p className="auth-page-foot">
            <Link href="/forgot-password" className="auth-page-foot-link">
              Forgot your password?
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </p>
        </div>
      </main>
      <MarketingFooter hideWordmark />
    </div>
  );
}
