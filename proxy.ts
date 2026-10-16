import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { assertApplicationAccess, safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { SessionCheckDeadlineError, createSessionCheck } from "@/src/lib/supabase/session-check";
import { ADMIN_HOST, isAdminRoutePath, isProtectedAppPath, resolveHostRedirect, resolveRequestHostname } from "@/src/lib/site-routing";
import { supabaseAuthCookieOptions } from "@/src/lib/auth/cookie-domain";
import { isCrossSiteRequest } from "@/src/lib/security/same-origin";
import { rememberPlanIntent } from "@/src/lib/billing/plan-intent-cookie";

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

const SESSION_CHECK_RETRY_AFTER_SECONDS = "5";

function errorDetails(error: unknown): Record<string, unknown> {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
  return {
    error: error instanceof Error ? error.message : String(error),
    ...(code ? { code } : {}),
  };
}

// The Fetch Metadata header is the reliable signal: Next strips its own RSC
// headers before Proxy runs, and a client-side navigation or prefetch is a
// fetch() with sec-fetch-dest "empty". Older clients without it fall back to
// whether they asked for HTML.
function isDocumentRequest(request: NextRequest): boolean {
  const destination = request.headers.get("sec-fetch-dest");
  if (destination) return destination === "document";
  return request.headers.get("sec-fetch-mode") === "navigate" || (request.headers.get("accept") ?? "").includes("text/html");
}

const SESSION_CHECK_UNAVAILABLE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Linkar is briefly unavailable</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:Canvas;color:CanvasText}
main{max-width:28rem;text-align:center}
h1{font-size:1.25rem;margin:0 0 8px}
p{margin:0 0 20px;line-height:1.5}
a{display:inline-block;padding:10px 18px;border-radius:8px;background:CanvasText;color:Canvas;text-decoration:none}
</style>
</head>
<body>
<main>
<h1>We could not check your sign-in</h1>
<p>This is a brief problem on our side, and you have not been signed out. Please try again in a few seconds.</p>
<a href="">Try again</a>
</main>
</body>
</html>
`;

/**
 * "Could not check" is not "signed out": when Supabase Auth or the database is
 * failing, a redirect to /login would look like a mass logout and send
 * everyone into a sign-in loop that adds load. Answer 503 with Retry-After
 * instead, keeping any refreshed session cookies the check already set.
 */
function sessionCheckUnavailable(request: NextRequest, checked: NextResponse, stage: "claims" | "access", error: unknown): NextResponse {
  logger.error("Proxy could not check the session; answering 503", {
    stage,
    path: request.nextUrl.pathname,
    ...errorDetails(error),
  });
  const headers = { "Retry-After": SESSION_CHECK_RETRY_AFTER_SECONDS, "Cache-Control": "no-store" };
  const unavailable = request.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: "session_check_unavailable", retryable: true }, { status: 503, headers })
    : isDocumentRequest(request)
      ? new NextResponse(SESSION_CHECK_UNAVAILABLE_PAGE, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } })
      // RSC fetches: on a non-OK answer a client-side navigation falls back
      // to a full page load, which gets the page above, and a prefetch is
      // simply dropped.
      : new NextResponse(null, { status: 503, headers });
  for (const cookie of checked.cookies.getAll()) unavailable.cookies.set(cookie);
  return unavailable;
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
    // A marketing page asked for on the app or admin host has one permanent
    // home on the marketing host, so say so with a 308 and let search engines
    // consolidate on it. Every other hop stays temporary (307): /login,
    // /signup and the other app routes moving to app., the owner console
    // moving to admin., and the bare app and admin roots (/dashboard, /admin).
    return NextResponse.redirect(destination, hostRedirect.target === "marketing" ? 308 : 307);
  }

  // Public marketing, legal, and authentication routes should not be sent
  // through the session gate. Their host canonicalization above is separate
  // from authorization so the same app build can serve both domains safely.
  // /signup and /login also remember a plan picked on /pricing (plan-intent-cookie.ts).
  if (!isProtectedAppPath(request.nextUrl.pathname)) return rememberPlanIntent(request, NextResponse.next(), env);

  const response = NextResponse.next();
  const isAdminRoute = isAdminRoutePath(request.nextUrl.pathname);
  // Caps the check at 10 s and gives up after two 5xx answers in a row to a
  // token refresh, instead of waiting out auth-js's retries (session-check.ts).
  const sessionCheck = createSessionCheck();
  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookieOptions: supabaseAuthCookieOptions(env),
    global: { fetch: sessionCheck.fetch },
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

  let claims: Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  try {
    claims = await sessionCheck.run(supabase.auth.getClaims());
  } catch (error) {
    if (error instanceof SessionCheckDeadlineError || isAuthRetryableFetchError(error)) {
      return sessionCheckUnavailable(request, response, "claims", error);
    }
    throw error;
  }
  const { data, error } = claims;
  // A network failure or a 5xx from Supabase Auth says nothing about the
  // session. Only a definite answer (no session, a bad token) means sign in.
  if (error && isAuthRetryableFetchError(error)) return sessionCheckUnavailable(request, response, "claims", error);
  // Supabase's rate limit on token refreshes counts this server's address,
  // which every signed-in user shares, so a 429 says nothing about this
  // session either. auth-js has already queued deletion of the session
  // cookies (empty values) on `response`, so start from a fresh response and
  // pass on only cookies it set: the person stays signed in.
  if (error && isAuthApiError(error) && error.status === 429) {
    const kept = NextResponse.next();
    for (const cookie of response.cookies.getAll()) if (cookie.value) kept.cookies.set(cookie);
    return sessionCheckUnavailable(request, kept, "claims", error);
  }
  if (!error && data?.claims?.sub && data.claims.email) {
    // Admin authorization is intentionally separate from workspace access:
    // the platform owner may have no workspace membership at all. Let the
    // owner-console DAL perform the authoritative allowlist/MFA checks.
    if (isAdminRoute) return response;

    let access: Awaited<ReturnType<typeof assertApplicationAccess>>;
    try {
      access = await assertApplicationAccess(
        String(data.claims.sub),
        String(data.claims.email),
        typeof data.claims.iat === "number" ? data.claims.iat : null,
      );
    } catch (accessError) {
      // A database error (a pool timeout, an outage) is "could not check".
      // A null result is a definite "no access" and still goes to /login.
      return sessionCheckUnavailable(request, response, "access", accessError);
    }
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
    "/features/:path*",
    "/solutions/:path*",
    "/templates/:path*",
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
    "/onboarding/:path*",
    "/admin/:path*",
    "/api/:path*",
    "/dev-preview/:path*",
  ],
};
