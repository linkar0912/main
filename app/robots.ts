import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { ADMIN_HOST, APP_HOST, MARKETING_HOST, resolveRequestHostname } from "@/src/lib/site-routing";
import { publicSiteOrigin } from "@/src/lib/site-url";

/** Never useful in search: the API, the owner console, auth, and redirects. */
const ROBOTS_DISALLOWED_PATHS = [
  "/api/",
  "/admin",
  "/auth/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/r/",
  "/dashboard",
  "/activity",
  "/automations",
  "/contacts",
  "/insights",
  "/quick-automation",
  "/settings",
  "/profile",
  "/help",
  "/data-deletion/status/",
  "/dev-preview",
];

/**
 * One build serves linkar.in, app.linkar.in, and admin.linkar.in, so the
 * answer depends on the host asked. The app and admin hosts are closed to
 * crawlers entirely; their public pages redirect to the marketing host anyway.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = resolveRequestHostname(await headers(), MARKETING_HOST).toLowerCase().replace(/:\d+$/, "");

  if (host === APP_HOST || host === ADMIN_HOST) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: ROBOTS_DISALLOWED_PATHS },
    sitemap: `${publicSiteOrigin()}/sitemap.xml`,
    host: publicSiteOrigin(),
  };
}
