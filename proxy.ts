import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { assertApplicationAccess, safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { ADMIN_HOST, isAdminRoutePath, isProtectedAppPath, resolveHostRedirect, resolveRequestHostname } from "@/src/lib/site-routing";
import { supabaseAuthCookieOptions } from "@/src/lib/auth/cookie-domain";
import { isCrossSiteRequest } from "@/src/lib/security/same-origin";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Provider callbacks are server-to-server and authenticate with signatures;
// they never carry a browser Origin, so the cross-site check does not apply.
const PROVIDER_CALLBACK_PATHS = [
  "/api/meta/webhook",
  "/api/meta/deauthorize",
  "/api/meta/data-deletion",
  "/api/facebook/webhook",
  "/api/facebook/deauthorize",
  "/api/facebook/data-deletion",
  "/api/razorpay/webhook",
] as const;

function isProviderCallbackPath(pathname: string): boolean {
  return PROVIDER_CALLBACK_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// Canonicalizes the marketing and app hosts, then applies an optimistic gate
// to authenticated page routes. The gate also refreshes the Supabase session
// cookie (via getClaims()) so it stays fresh across page navigations without
// every page needing its own refresh logic. Each API route still independently
// verifies via getValidatedSession(); Proxy is not the source of truth for
// authorization (see Next.js's Proxy guidance against using it as one).
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Design previews (app/dev-preview) render screens with sample data for
  // local review only. Their pages call notFound() outside development, but a
  // statically prerendered not-found shell is still served with HTTP 200, so
  // answer production requests with a real 404 before Next renders anything.
  if ((pathname === "/dev-preview" || pathname.startsWith("/dev-preview/")) && process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }
  // Every state-changing API call made with a browser session must come from
  // our own pages. SameSite=Lax already blocks most cross-site POSTs, but the
  // session cookie is scoped to the parent domain, so a sibling subdomain is
  // "same-site"; this closes that gap for all routes in one place.
  if (pathname.startsWith("/api/") && !SAFE_METHODS.has(request.method) && !isProviderCallbackPath(pathname) && isCrossSiteRequest(request)) {
    return NextResponse.json({ error: "cross_site_request" }, { status: 403 });
  }
  if (pathname.startsWith("/api/") && !isAdminRoutePath(pathname)) return NextResponse.next();

  const env = getServerEnv();

  const hostname = resolveRequestHostname(request.headers, request.nextUrl.hostname);
  const hostRedirect = resolveHostRedirect(hostname, request.nextUrl.pathname, new URL(env.adminUrl).host);
  if (hostRedirect) {
    const baseUrl = hostRedirect.target === "admin" ? env.adminUrl : hostRedirect.target === "app" ? env.appUrl : env.publicSiteUrl;
    const destination = new URL(hostRedirect.pathname, baseUrl);
    destination.search = request.nextUrl.search;
    return NextResponse.redirect(destination);
  }

  // Public marketing, legal, and authentication routes should not be sent
  // through the session gate. Their host canonicalization above is separate
  // from authorization so the same app build can serve both domains safely.
  if (!isProtectedAppPath(request.nextUrl.pathname)) return NextResponse.next();

  const response = NextResponse.next();
  const isAdminRoute = isAdminRoutePath(request.nextUrl.pathname);
  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookieOptions: supabaseAuthCookieOptions(env),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  if (!error && data?.claims?.sub && data.claims.email) {
    // Admin authorization is intentionally separate from workspace access:
    // the platform owner may have no workspace membership at all. Let the
    // owner-console DAL perform the authoritative allowlist/MFA checks.
    if (isAdminRoute) return response;

    const access = await assertApplicationAccess(
      String(data.claims.sub),
      String(data.claims.email),
      typeof data.claims.iat === "number" ? data.claims.iat : null,
    ).catch(() => null);
    if (access) return response;
  }

  const login = new URL("/login", hostname.toLowerCase().replace(/:\d+$/, "") === ADMIN_HOST || request.nextUrl.pathname.startsWith("/admin") ? env.adminUrl : env.appUrl);
  // safeNextPath rejects off-site paths ("//evil.example") and control
  // characters; we re-use it so a crafted /help?x=1%0d%0anext=… cannot smuggle
  // headers or a different login next into the redirect.
  const next = safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  // /activity is the per-workspace activity feed, gated like every other
  // authenticated page. New gated routes should be appended here - keep the
  // list aligned with the routes that render <AppShell> in app/.
  matcher: [
    "/",
    "/auth/:path*",
    "/login/:path*",
    "/signup/:path*",
    "/forgot-password/:path*",
    "/reset-password/:path*",
    "/pricing/:path*",
    "/privacy/:path*",
    "/terms/:path*",
    "/acceptable-use/:path*",
    "/cookies/:path*",
    "/data-processing/:path*",
    "/service-providers/:path*",
    "/data-deletion/:path*",
    "/support/:path*",
    "/refund-policy/:path*",
    "/contact/:path*",
    "/dashboard/:path*",
    "/activity/:path*",
    "/automations/:path*",
    "/contacts/:path*",
    "/insights/:path*",
    "/quick-automation/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/help/:path*",
    "/admin/:path*",
    "/api/:path*",
    "/dev-preview/:path*",
  ],
};
