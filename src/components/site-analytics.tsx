import Script from "next/script";
import { SiteAnalyticsRoutes } from "./site-analytics-routes";

/**
 * Google Analytics 4, exactly the snippet the GA console hands out, loaded
 * through next/script so it does not block hydration.
 *
 * Rendered only when GA_MEASUREMENT_ID is set, which keeps local development
 * and preview builds out of the production property. googletagmanager.com and
 * google-analytics.com are allow-listed in the CSP in next.config.ts; without
 * those entries the browser blocks both the loader and every beacon.
 *
 * send_page_view is off because this layout wraps the signed-in app as well as
 * the marketing pages, and several app routes carry an identifier in the URL -
 * /data-deletion/status/[code] most of all. SiteAnalyticsRoutes sends the
 * page_view instead, after redactAnalyticsPath has stripped the identifiers.
 */
export function SiteAnalytics({ measurementId }: { measurementId: string }) {
  if (!measurementId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(measurementId)}, { send_page_view: false });`}
      </Script>
      <SiteAnalyticsRoutes enabled />
    </>
  );
}
