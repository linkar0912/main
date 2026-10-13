"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { CONSENT_REQUIRED_REGIONS, type AnalyticsConsent } from "@/src/lib/analytics-consent";
import { isAnalyticsPage } from "@/src/lib/analytics-path";
import { ADMIN_HOST } from "@/src/lib/site-routing";
import { AnalyticsConsentBanner, useAnalyticsConsent, useConsentRequired } from "./analytics-consent";
import { SiteAnalyticsRoutes } from "./site-analytics-routes";

declare global {
  interface Window {
    dataLayer?: unknown[];
    [gaDisable: `ga-disable-${string}`]: boolean | undefined;
  }
}

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

/** A GA4 measurement ID, or "" for anything else (unset, blank, or malformed). */
export function resolveMeasurementId(value: string | undefined): string {
  const id = (value ?? "").trim();
  return MEASUREMENT_ID_PATTERN.test(id) ? id : "";
}

/**
 * NEXT_PUBLIC_GA_MEASUREMENT_ID is inlined at build time, so the static
 * marketing pages carry it with no runtime lookup. Production images are
 * built with the property ID (see .github/workflows/container.yml); local
 * development, previews, tests and e2e builds leave it unset and render
 * nothing at all.
 */
const BUILD_MEASUREMENT_ID = resolveMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);

const noopSubscribe = () => () => {};

// Undefined until first read in the browser; then the path this document was
// loaded at, or null on the owner-console host.
let documentPath: string | null | undefined;

/**
 * Whether this document may load Google Analytics at all. Decided once, from
 * the URL the document was loaded at, because that is the URL whose Content
 * Security Policy the browser enforces for the document's whole life: only
 * the pages in ANALYTICS_PAGE_PATHS allow googletagmanager.com. A visitor who
 * lands in the app and navigates client-side to /pricing therefore gets no
 * tag, rather than a blocked script and a CSP error.
 */
function documentAllowsAnalytics(): boolean {
  if (documentPath === undefined) {
    documentPath = window.location.hostname.toLowerCase() === ADMIN_HOST ? null : window.location.pathname;
  }
  return isAnalyticsPage(documentPath);
}

let initializedFor: string | null = null;

/** Test seam: forget which document and property this module has seen. */
export function resetSiteAnalyticsForTests(): void {
  documentPath = undefined;
  initializedFor = null;
}

/**
 * The gtag bootstrap from the GA console, with Google Consent Mode v2
 * defaults ahead of the config call:
 *
 * - Advertising purposes are denied everywhere, always.
 * - analytics_storage starts denied in CONSENT_REQUIRED_REGIONS (Google
 *   matches the visitor's IP), and for any visitor shown the cookie notice.
 *   Everyone else starts granted.
 * - A stored "granted" choice is applied straight away. A stored "denied"
 *   never gets here: the tag does not load at all.
 *
 * send_page_view is off so SiteAnalyticsRoutes can send each page_view with
 * the query string and fragment stripped (sign-up links carry invite codes).
 */
function initializeGoogleTag(measurementId: string, consent: AnalyticsConsent, askFirst: boolean): void {
  if (initializedFor === measurementId) return;
  initializedFor = measurementId;
  const dataLayer = (window.dataLayer = window.dataLayer ?? []);
  window.gtag = function gtag() {
    // gtag.js only acts on Arguments objects in the dataLayer, not arrays.
    dataLayer.push(arguments);
  };
  const advertising = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
  window.gtag("consent", "default", { ...advertising, analytics_storage: askFirst ? "denied" : "granted" });
  window.gtag("consent", "default", { ...advertising, analytics_storage: "denied", region: [...CONSENT_REQUIRED_REGIONS] });
  if (consent === "granted") window.gtag("consent", "update", { analytics_storage: "granted" });
  window.gtag("set", "ads_data_redaction", true);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
}

/** Runs the bootstrap in an effect that, as an earlier sibling, precedes the loader's. */
function GoogleTagBootstrap({ measurementId, consent, askFirst }: { measurementId: string; consent: AnalyticsConsent; askFirst: boolean }) {
  useEffect(() => {
    initializeGoogleTag(measurementId, consent, askFirst);
  }, [measurementId, consent, askFirst]);
  return null;
}

/**
 * Google Analytics 4 for the public website only (ANALYTICS_PAGE_PATHS), with
 * a cookie notice for visitors who must opt in. Mounted once in the root
 * layout; renders nothing in the signed-in app, the owner console, or any
 * build without a measurement ID.
 */
export function SiteAnalytics({ measurementId = BUILD_MEASUREMENT_ID }: { measurementId?: string }) {
  if (!measurementId) return null;
  return <PublicSiteAnalytics measurementId={measurementId} />;
}

function PublicSiteAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const consent = useAnalyticsConsent();
  const askFirst = useConsentRequired();
  const documentAllows = useSyncExternalStore(noopSubscribe, documentAllowsAnalytics, () => false);
  const pageAllowed = documentAllows && isAnalyticsPage(pathname);
  const load = documentAllows && consent !== "denied";

  // Follows the visitor's choice and the page after the tag has loaded:
  // leaving the public pages (into the app after signing in) or withdrawing
  // consent sets GA's own kill switch, so not even enhanced-measurement
  // events are sent from there.
  useEffect(() => {
    if (initializedFor !== measurementId) return;
    window[`ga-disable-${measurementId}`] = !pageAllowed || consent === "denied";
    if (consent && typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: consent });
    }
  }, [consent, pageAllowed, measurementId]);

  return (
    <>
      {load ? (
        <>
          <GoogleTagBootstrap measurementId={measurementId} consent={consent} askFirst={askFirst} />
          <Script
            id="google-analytics"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
            strategy="afterInteractive"
          />
          <SiteAnalyticsRoutes enabled={pageAllowed} />
        </>
      ) : null}
      {pageAllowed && consent === null && askFirst ? <AnalyticsConsentBanner /> : null}
    </>
  );
}
