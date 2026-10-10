import { MARKETING_HOST } from "./site-routing";

/**
 * The visitor's analytics choice, kept in a first-party cookie so it survives
 * across the marketing and app hosts and needs no server round trip. Google
 * Analytics does not load until this says "granted".
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
  const domain = analyticsConsentCookieDomain(window.location.hostname);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${choice}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${secure}`;
  if (choice === "denied") clearGoogleAnalyticsCookies(domain);
  window.dispatchEvent(new CustomEvent<AnalyticsConsentChoice>(ANALYTICS_CONSENT_EVENT, { detail: choice }));
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
