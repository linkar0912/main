import type { OnboardingSummary } from "./status";

export const ONBOARDING_PATH = "/onboarding";

/**
 * sessionStorage key: when onboarding could not load, or a skip could not be
 * saved, the person still leaves for Home. This timestamp stops the shell
 * sending them straight back (and multiplying requests on a struggling
 * server) for a while.
 */
export const ONBOARDING_DEFERRED_KEY = "linkar:onboarding-deferred";
/** How long a deferral holds before the shell asks again. */
export const ONBOARDING_DEFER_MS = 30 * 60_000;
/**
 * sessionStorage key: set once a bootstrap in this tab says onboarding is not
 * required, so the shell can show the page at once instead of holding it
 * until the redirect decision.
 */
export const ONBOARDING_NOT_REQUIRED_KEY = "linkar:onboarding-not-required";
/**
 * sessionStorage key: which account the two flags above belong to (a short
 * hash of the email, never the email itself), so a different account
 * signing in on the same tab does not inherit them.
 */
export const ONBOARDING_IDENTITY_KEY = "linkar:onboarding-identity";

function deferralActive(deferredAt: number | null | undefined, now: number): boolean {
  if (typeof deferredAt !== "number" || !Number.isFinite(deferredAt)) return false;
  const elapsed = now - deferredAt;
  return elapsed >= 0 && elapsed < ONBOARDING_DEFER_MS;
}

/**
 * Whether this page could be redirected into onboarding at all, before the
 * bootstrap says whether it is required: false on onboarding itself, API and
 * auth paths, previews, Settings while it shows a connect or billing result,
 * and while a deferral holds.
 */
export function mayRedirectToOnboarding(pathname: string, search: string, deferredAt?: number | null, now: number = Date.now()): boolean {
  if (deferralActive(deferredAt, now)) return false;
  if (pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`)) return false;
  if (pathname.startsWith("/api/") || pathname.startsWith("/auth/") || pathname.startsWith("/dev-preview")) return false;
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    const query = new URLSearchParams(search);
    if (query.has("meta") || query.has("facebook")) return false;
    // Billing with a plan from /pricing pre-selected opens its checkout, and
    // that comes after onboarding, never instead of it.
    if (query.get("section") === "billing" && !query.has("plan")) return false;
  }
  return true;
}

/**
 * Whether the app shell should send this person into onboarding. The shell
 * only wraps signed-in workspace pages, so API routes, auth pages, OAuth
 * callbacks and the onboarding page itself never get here; Settings is
 * still left alone while it is showing the result of a connect flow or a
 * billing change, so those never get lost behind a redirect. A deferral
 * (`deferredAt`, see ONBOARDING_DEFERRED_KEY) holds it off for 30 minutes.
 */
export function shouldRedirectToOnboarding(
  summary: OnboardingSummary | null | undefined,
  pathname: string,
  search: string,
  deferredAt?: number | null,
  now: number = Date.now(),
): boolean {
  if (!summary?.required) return false;
  return mayRedirectToOnboarding(pathname, search, deferredAt, now);
}

function tabStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Holds the onboarding redirect off for this tab (ONBOARDING_DEFER_MS). */
export function deferOnboarding(now: number = Date.now()): void {
  try {
    tabStorage()?.setItem(ONBOARDING_DEFERRED_KEY, String(now));
  } catch {
    // Storage blocked or full: the redirect simply is not held off.
  }
}

export function clearOnboardingDeferral(): void {
  try {
    tabStorage()?.removeItem(ONBOARDING_DEFERRED_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

/** The stored deferral timestamp, or null when there is none (or no storage). */
export function readOnboardingDeferral(): number | null {
  try {
    const value = Number(tabStorage()?.getItem(ONBOARDING_DEFERRED_KEY) ?? Number.NaN);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Remembers, for this tab, what the last bootstrap said about onboarding. */
export function rememberOnboardingNotRequired(notRequired: boolean): void {
  try {
    const storage = tabStorage();
    if (notRequired) storage?.setItem(ONBOARDING_NOT_REQUIRED_KEY, "1");
    else storage?.removeItem(ONBOARDING_NOT_REQUIRED_KEY);
  } catch {
    // Without storage the shell just waits for the bootstrap each time.
  }
}

export function onboardingKnownNotRequired(): boolean {
  try {
    return tabStorage()?.getItem(ONBOARDING_NOT_REQUIRED_KEY) === "1";
  } catch {
    return false;
  }
}

/** FNV-1a: enough to tell two accounts apart without storing the email. */
function identityHash(identity: string): string {
  let hash = 0x811c9dc5;
  for (const char of identity.trim().toLowerCase()) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Ties this tab's onboarding flags to the signed-in account (its email, from
 * the bootstrap). When a different account shows up, the deferral and the
 * "not required" flag were someone else's and are dropped, so the new
 * account is still sent into onboarding when it needs it.
 */
export function adoptOnboardingIdentity(identity: string): void {
  if (!identity.trim()) return;
  try {
    const storage = tabStorage();
    if (!storage) return;
    const current = identityHash(identity);
    const previous = storage.getItem(ONBOARDING_IDENTITY_KEY);
    if (previous !== null && previous !== current) {
      storage.removeItem(ONBOARDING_DEFERRED_KEY);
      storage.removeItem(ONBOARDING_NOT_REQUIRED_KEY);
    }
    storage.setItem(ONBOARDING_IDENTITY_KEY, current);
  } catch {
    // Without storage there are no flags to carry over.
  }
}
