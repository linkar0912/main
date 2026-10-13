import { MARKETING_HOST } from "./site-routing";

/**
 * The visitor's analytics choice, kept in a first-party cookie rather than
 * localStorage: the site spans two hosts (linkar.in for the marketing pages,
 * app.linkar.in for sign-in and sign-up) and a cookie on the parent domain is
 * the only browser storage both can read, so nobody is asked twice. "denied"
 * keeps Google Analytics from loading at all; with no choice yet, the
 * Consent Mode defaults in site-analytics.tsx apply.
 */
export const ANALYTICS_CONSENT_COOKIE = "linkar_analytics_consent";
export const ANALYTICS_CONSENT_EVENT = "linkar:analytics-consent";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type AnalyticsConsentChoice = "granted" | "denied";
export type AnalyticsConsent = AnalyticsConsentChoice | null;

export function parseAnalyticsConsent(cookieHeader: string): AnalyticsConsent {
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() !== ANALYTICS_CONSENT_COOKIE) continue;
    const value = rest.join("=").trim();
    return value === "granted" || value === "denied" ? value : null;
  }
  return null;
}

/**
 * linkar.in and app.linkar.in share the choice through the parent domain, so a
 * visitor is not asked twice. Elsewhere (localhost, previews) the cookie stays
 * host-only.
 */
export function analyticsConsentCookieDomain(hostname: string): string | undefined {
  const host = hostname.toLowerCase();
  return host === MARKETING_HOST || host.endsWith(`.${MARKETING_HOST}`) ? MARKETING_HOST : undefined;
}

export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof document === "undefined") return null;
  try {
    return parseAnalyticsConsent(document.cookie);
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(choice: AnalyticsConsentChoice): void {
  if (typeof document === "undefined") return;
  // Cookie access throws in sandboxed frames and some privacy modes. The
  // choice still applies to the open page through the event below.
  try {
    const domain = analyticsConsentCookieDomain(window.location.hostname);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${choice}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${secure}`;
    if (choice === "denied") clearGoogleAnalyticsCookies(domain);
  } catch {
    // Nothing to remember; the event still updates this page.
  }
  window.dispatchEvent(new CustomEvent<AnalyticsConsentChoice>(ANALYTICS_CONSENT_EVENT, { detail: choice }));
}

/**
 * Where analytics needs an opt-in before any cookie is set: the EEA, the UK
 * and Switzerland, as ISO 3166-1 codes in the form Google Consent Mode's
 * `region` parameter takes. Google matches them against the visitor's IP
 * address, so analytics starts denied there whatever the browser reports.
 */
export const CONSENT_REQUIRED_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
  "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
] as const;

/** European time zones that are not under Europe/ - Iceland, the Canaries, Madeira, the Azores, the Faroes. */
const europeanAtlanticZones = new Set(["Atlantic/Reykjavik", "Atlantic/Canary", "Atlantic/Madeira", "Atlantic/Azores", "Atlantic/Faroe", "Arctic/Longyearbyen"]);

/**
 * Whether to show this visitor the cookie notice. The browser's time zone is
 * the only location signal a statically rendered page has; it decides who is
 * asked. Who is tracked before answering is decided separately, and more
 * strictly, by CONSENT_REQUIRED_REGIONS above. An unknown zone counts as
 * European, so the notice errs towards asking.
 */
export function timeZoneRequiresConsent(timeZone: string | undefined): boolean {
  if (!timeZone) return true;
  return timeZone.startsWith("Europe/") || europeanAtlanticZones.has(timeZone);
}

export function visitorTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Removes the _ga and _ga_<id> cookies GA set before the visitor withdrew consent. */
function clearGoogleAnalyticsCookies(domain: string | undefined): void {
  const names = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => name === "_ga" || name.startsWith("_ga_") || name === "_gid");
  const domains = [undefined, window.location.hostname, `.${window.location.hostname}`, domain, domain ? `.${domain}` : undefined];
  for (const name of names) {
    for (const cookieDomain of domains) {
      document.cookie = `${name}=; Path=/; Max-Age=0${cookieDomain ? `; Domain=${cookieDomain}` : ""}`;
    }
  }
}

export function subscribeAnalyticsConsent(onChange: () => void): () => void {
  window.addEventListener(ANALYTICS_CONSENT_EVENT, onChange);
  return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onChange);
}
