import { getServerEnv } from "@/src/lib/env";
import { resolveRequestHostname } from "@/src/lib/site-routing";

/**
 * CSRF guard for state-changing endpoints a browser reaches with ambient
 * cookies (form POSTs, fetch from our own pages). SameSite=Lax cookies already
 * stop most cross-site POSTs from carrying a session, but login/signup/reset
 * forms do not need a session to be abused (login CSRF signs the victim into
 * the attacker's account), so they check provenance explicitly.
 *
 * Sec-Fetch-Site and Origin are forbidden request headers: a page cannot
 * forge them in a victim's browser. A request carrying neither is a
 * non-browser client (curl, server-to-server) and holds no victim cookies, so
 * it is allowed through.
 */
function originOf(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function configuredOrigins(): string[] {
  try {
    const env = getServerEnv();
    return [env.appUrl, env.adminUrl, env.publicSiteUrl].filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

export function isCrossSiteRequest(request: Request, trustedOrigins: readonly string[] = configuredOrigins()): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase() ?? null;
  if (fetchSite === "cross-site") return true;
  if (fetchSite === "same-origin" || fetchSite === "none") return false;

  // "same-site" (a sibling subdomain) or an older browser that only sends
  // Origin: the Origin must be one of our own hosts.
  if (origin === null) return fetchSite === "same-site";
  if (origin === "null") return true;
  const normalizedOrigin = originOf(origin);
  if (!normalizedOrigin) return true;
  const trusted = new Set(trustedOrigins.map(originOf).filter((value): value is string => value !== null));
  if (trusted.has(normalizedOrigin)) return false;
  if (fetchSite === "same-site") return true;

  // Behind a reverse proxy request.url can carry an internal host, so compare
  // against the public host the proxy forwarded as well.
  const ownHosts = new Set([
    hostOf(request.url),
    resolveRequestHostname(request.headers, "").toLowerCase() || null,
  ].filter((value): value is string => Boolean(value)));
  return !ownHosts.has(hostOf(normalizedOrigin) ?? "");
}

/**
 * Returns a 403 response for a cross-site request, or null to continue.
 * Apply to every non-GET API route that changes state on behalf of a
 * browser session (not to provider callbacks such as Meta webhooks, which
 * carry no Origin and authenticate with signatures instead).
 */
export function rejectCrossSiteRequest(request: Request, trustedOrigins?: readonly string[]): Response | null {
  if (!isCrossSiteRequest(request, trustedOrigins)) return null;
  return new Response("Cross-site request rejected", { status: 403 });
}
