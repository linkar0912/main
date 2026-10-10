import { PRODUCT_NAME } from "./branding";
import { MARKETING_HOST } from "./site-routing";

/** Open Graph fields every page shares; spread them into a page's own openGraph. */
export const OPEN_GRAPH_DEFAULTS = { type: "website", siteName: PRODUCT_NAME, locale: "en_IN" } as const;

/**
 * Canonical public origin for metadata: canonical links, Open Graph URLs,
 * robots.txt, and the sitemap. Read outside getServerEnv because it runs while
 * pages are prerendered at image build time, when production secrets are not
 * present; PUBLIC_SITE_URL is honoured when set, else the marketing host.
 */
export function publicSiteOrigin(): string {
  const configured = process.env.PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the production host; getServerEnv reports the bad value.
    }
  }
  return `https://${MARKETING_HOST}`;
}
