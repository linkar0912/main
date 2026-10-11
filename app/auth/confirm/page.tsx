import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/src/components/marketing/marketing-header";
import { MarketingFooter } from "@/src/components/marketing/marketing-footer";
import { SubmitButton } from "@/src/components/auth/submit-button";
import { sanitizeInvite } from "@/src/lib/auth/auth-redirect";
import { parseEmailOtpType } from "@/src/lib/auth/email-otp";
import { safeNextPath } from "@/src/lib/auth/session";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { getServerEnv } from "@/src/lib/env";

// Reads the deployment's publicSiteUrl at request time; see /login.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Confirm · ${PRODUCT_NAME}`,
  robots: { index: false, follow: false },
  // The token is in this page's URL; never send it onward as a Referer.
  referrer: "no-referrer",
};

type ConfirmPageProps = {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string; invite?: string }>;
};

/**
 * Landing page for every Supabase auth email link (signup confirmation,
 * password recovery, admin invites). It used to verify the token on GET,
 * which let mail-security scanners that pre-fetch links burn the one-time
 * token before the person clicked, and let a third-party page log a victim
 * into an attacker's account by embedding a confirmation link. Verification
 * now happens only when the person presses Continue (a same-origin POST to
 * /api/auth/confirm).
 */
export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const { publicSiteUrl } = getServerEnv();
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" && params.token_hash.length <= 512 ? params.token_hash : "";
  const type = parseEmailOtpType(params.type);
  const next = safeNextPath(params.next);
  const invite = sanitizeInvite(params.invite);
  const recovery = type === "recovery";

  return (
    <div data-header-tone="light">
      <MarketingHeader siteOrigin={publicSiteUrl} />
      <main className="auth-page-section" data-auth-tone="editorial">
        <div className="auth-page-frame">
          {tokenHash && type ? (
            <>
              <h1>{recovery ? "Reset your password" : "Confirm your email"}</h1>
              <p className="auth-page-lede">
                {recovery
                  ? "Continue to choose a new password for your account."
                  : `Continue to confirm your email address and open ${PRODUCT_NAME}.`}
              </p>
              <form method="post" action="/api/auth/confirm" className="login-form">
                <input type="hidden" name="token_hash" value={tokenHash} />
                <input type="hidden" name="type" value={type} />
                <input type="hidden" name="next" value={next} />
                {invite && <input type="hidden" name="invite" value={invite} />}
                <SubmitButton pendingLabel="Checking link...">Continue</SubmitButton>
              </form>
            </>
          ) : (
            <>
              <h1>Link incomplete</h1>
              <p className="auth-page-lede">
                This link is missing part of its address. Open it again from the email, or request a new one.
              </p>
              <Link className="button button-primary auth-page-action" href="/login" prefetch={false}>Back to sign in</Link>
            </>
          )}
        </div>
      </main>
      <MarketingFooter siteOrigin={publicSiteUrl} />
    </div>
  );
}
