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
