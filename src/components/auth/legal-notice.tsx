import { marketingHref } from "@/src/lib/site-routing";

/**
 * Consent line shown above the sign-in and sign-up actions (the OAuth buttons
 * and the form submit). The legal pages live on the marketing host, so their
 * links are absolutised the same way the marketing chrome's are.
 */
export function AuthLegalNotice({ siteOrigin }: { siteOrigin?: string }) {
  return (
    <p className="auth-page-hint" data-auth-legal>
      By continuing you agree to the{" "}
      <a href={marketingHref("/terms", siteOrigin)}>Terms</a>
      {" "}and{" "}
      <a href={marketingHref("/privacy", siteOrigin)}>Privacy Policy</a>.
    </p>
  );
}
