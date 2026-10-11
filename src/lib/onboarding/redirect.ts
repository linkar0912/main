import type { OnboardingSummary } from "./status";

export const ONBOARDING_PATH = "/onboarding";

/**
 * Whether the app shell should send this person into onboarding. The shell
 * only wraps signed-in workspace pages, so API routes, auth pages, OAuth
 * callbacks and the onboarding page itself never get here; Settings is
 * still left alone while it is showing the result of a connect flow or a
 * billing change, so those never get lost behind a redirect.
 */
export function shouldRedirectToOnboarding(summary: OnboardingSummary | null | undefined, pathname: string, search: string): boolean {
  if (!summary?.required) return false;
  if (pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`)) return false;
  if (pathname.startsWith("/api/") || pathname.startsWith("/auth/") || pathname.startsWith("/dev-preview")) return false;
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    const query = new URLSearchParams(search);
    if (query.has("meta") || query.has("facebook") || query.get("section") === "billing") return false;
  }
  return true;
}
