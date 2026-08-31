export const MARKETING_HOST = "linkar.in";
export const APP_HOST = "app.linkar.in";
export const ADMIN_HOST = "admin.linkar.in";

const ADMIN_ROUTE_PREFIXES = ["/admin", "/api/admin"] as const;

const APP_ROUTE_PREFIXES = [
  "/auth",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/dashboard",
  "/activity",
  "/automations",
  "/settings",
  "/profile",
  "/help",
] as const;

const PROTECTED_APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/activity",
  "/automations",
  "/settings",
  "/profile",
  "/help",
  "/admin",
] as const;

const MARKETING_ROUTE_PREFIXES = [
  "/privacy",
  "/terms",
  "/data-deletion",
  "/support",
] as const;

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/:\d+$/, "");
}

export type HostRedirect = {
  target: "app" | "admin" | "marketing";
  pathname: string;
};

type HeaderReader = {
  get(name: string): string | null;
};

/**
 * Resolves the public hostname when the reverse proxy gives Next an internal
 * request URL. Forwarded host lists are ordered from the original client
 * toward the application, so the first value is the one the user requested.
 */
export function resolveRequestHostname(headers: HeaderReader, fallbackHostname: string): string {
  for (const header of ["x-forwarded-host", "host"]) {
    const value = headers.get(header)?.split(",", 1)[0]?.trim();
    if (value) return value;
  }
  return fallbackHostname;
}

/** Returns the canonical host/path destination for a known public host. */
export function resolveHostRedirect(hostname: string, pathname: string): HostRedirect | null {
  const host = normalizeHostname(hostname);

  if (ADMIN_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    return host === ADMIN_HOST ? null : { target: "admin", pathname };
  }

  if (host === MARKETING_HOST && APP_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    return { target: "app", pathname };
  }

  if (host === ADMIN_HOST) {
    if (pathname === "/") return { target: "admin", pathname: "/admin" };
    if (pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout") return null;
    if (MARKETING_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))) return { target: "marketing", pathname };
    if (APP_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))) return { target: "app", pathname };
    return null;
  }

  if (host !== APP_HOST) return null;
  if (pathname === "/") return { target: "app", pathname: "/dashboard" };
  if (MARKETING_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    return { target: "marketing", pathname };
  }

  return null;
}

/**
 * Whether a link target is served by the marketing host. The homepage and its
 * in-page anchors count, as do the public legal/support pages.
 */
export function isMarketingPath(href: string): boolean {
  const pathname = href.split("#", 1)[0] || "/";
  if (pathname === "/") return true;
  return MARKETING_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

/**
 * Absolutises a marketing-bound link for a page that is not served from the
 * marketing host.
 *
 * The auth screens (/login, /signup, /forgot-password, /reset-password) run on
 * the app host but render the marketing header and footer, whose links are all
 * root-relative. On the app host "/#product" resolves to app.linkar.in/, which
 * the proxy sends to /dashboard, which is gated - so every marketing link in
 * the header bounced the visitor straight back to the login page they were
 * already on. Pointing them at the marketing origin fixes that without
 * changing anything on the marketing host, where relative links are correct
 * and keep client-side navigation.
 */
export function marketingHref(href: string, siteOrigin?: string): string {
  if (!siteOrigin || !href.startsWith("/") || !isMarketingPath(href)) return href;
  return `${siteOrigin.replace(/\/+$/, "")}${href}`;
}

export function applicationOriginForPath(pathname: string, origins: { appUrl: string; adminUrl: string }): string {
  return matchesPathPrefix(pathname, "/admin") ? origins.adminUrl : origins.appUrl;
}

/** Whether a request belongs to the owner-console route family. */
export function isAdminRoutePath(pathname: string): boolean {
  return ADMIN_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

/** Whether a page path should run the optimistic Supabase session gate. */
export function isProtectedAppPath(pathname: string): boolean {
  return PROTECTED_APP_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}
