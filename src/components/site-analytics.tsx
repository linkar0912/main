"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { AnalyticsConsentBanner, useAnalyticsConsent } from "./analytics-consent";
import { SiteAnalyticsRoutes } from "./site-analytics-routes";

declare global {
  interface Window {
    [gaDisable: `ga-disable-${string}`]: boolean | undefined;
  }
}

/** Public runtime config, served by app/api/site-config. */
export const SITE_CONFIG_PATH = "/api/site-config";

let measurementIdRequest: Promise<string> | null = null;

/**
 * GA_MEASUREMENT_ID is a runtime setting, but the marketing pages are
 * prerendered at image build time when it is not set. Reading it from a tiny
 * runtime endpoint keeps those pages static and still lets one image point at
 * any property. One request per page load, shared by every caller.
 */
function loadMeasurementId(): Promise<string> {
  measurementIdRequest ??= fetch(SITE_CONFIG_PATH, { credentials: "omit" })
    .then((response) => (response.ok ? response.json() : null))
    .then((config: { gaMeasurementId?: unknown } | null) =>
      typeof config?.gaMeasurementId === "string" ? config.gaMeasurementId.trim() : "")
    .catch(() => {
      measurementIdRequest = null;
      return "";
    });
  return measurementIdRequest;
}

/** Test seam: forget the cached config request. */
export function resetSiteAnalyticsConfigForTests(): void {
  measurementIdRequest = null;
}

/**
 * Google Analytics 4 behind a consent banner.
 *
 * Nothing from Google loads until the visitor accepts. When they do, the tag
 * starts with Consent Mode v2 defaults of "denied" for every purpose and then
 * grants analytics_storage only; advertising purposes stay denied. Rejecting
 * later (from the cookies statement) flips analytics_storage back to denied and
 * sets GA's own disable flag, so no further hits are sent from the open page.
 *
 * Without a measurement ID (local development, previews) there is no banner
 * and no tag. googletagmanager.com and google-analytics.com are allow-listed in
 * the CSP in next.config.ts.
 */
export function SiteAnalytics() {
  const consent = useAnalyticsConsent();
  const [measurementId, setMeasurementId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadMeasurementId().then((id) => {
      if (active) setMeasurementId(id);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!measurementId || consent === null) return;
    window[`ga-disable-${measurementId}`] = consent !== "granted";
    // Only matters when the tag already loaded earlier in this page's life:
    // a first load applies its own consent state in the init snippet.
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: consent });
    }
  }, [consent, measurementId]);

  if (!measurementId) return null;
  if (consent === null) return <AnalyticsConsentBanner />;
  if (consent !== "granted") return null;
  return <GoogleAnalyticsTag measurementId={measurementId} />;
}

/**
 * The gtag snippet the GA console hands out, with Consent Mode v2 defaults
 * ahead of the config call. Rendered only after the visitor has accepted.
 *
 * send_page_view is off because this layout wraps the signed-in app as well as
 * the marketing pages, and several app routes carry an identifier in the URL -
 * /data-deletion/status/[code] most of all. SiteAnalyticsRoutes sends the
 * page_view instead, after redactAnalyticsPath has stripped the identifiers.
 */
export function GoogleAnalyticsTag({ measurementId }: { measurementId: string }) {
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
gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
gtag('consent', 'update', { analytics_storage: 'granted' });
gtag('js', new Date());
gtag('config', ${JSON.stringify(measurementId)}, { send_page_view: false });`}
      </Script>
      <SiteAnalyticsRoutes enabled />
    </>
  );
}
