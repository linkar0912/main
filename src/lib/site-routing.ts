export const MARKETING_HOST = "linkar.in";
export const APP_HOST = "app.linkar.in";

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
  target: "app" | "marketing";
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

  if (host === MARKETING_HOST && APP_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    return { target: "app", pathname };
  }

  if (host !== APP_HOST) return null;
  if (pathname === "/") return { target: "app", pathname: "/dashboard" };
  if (MARKETING_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    return { target: "marketing", pathname };
  }

  return null;
}

/** Whether a page path should run the optimistic Supabase session gate. */
export function isProtectedAppPath(pathname: string): boolean {
  return PROTECTED_APP_ROUTE_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}
