import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { assertApplicationAccess, safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { isProtectedAppPath, resolveHostRedirect, resolveRequestHostname } from "@/src/lib/site-routing";

// Canonicalizes the marketing and app hosts, then applies an optimistic gate
// to authenticated page routes. The gate also refreshes the Supabase session
// cookie (via getClaims()) so it stays fresh across page navigations without
// every page needing its own refresh logic. Each API route still independently
// verifies via getValidatedSession(); Proxy is not the source of truth for
// authorization (see Next.js's Proxy guidance against using it as one).
export async function proxy(request: NextRequest) {
  const env = getServerEnv();

  const hostname = resolveRequestHostname(request.headers, request.nextUrl.hostname);
  const hostRedirect = resolveHostRedirect(hostname, request.nextUrl.pathname);
  if (hostRedirect) {
    const baseUrl = hostRedirect.target === "app" ? env.appUrl : env.publicSiteUrl;
    const destination = new URL(hostRedirect.pathname, baseUrl);
    destination.search = request.nextUrl.search;
    return NextResponse.redirect(destination);
  }

  // Public marketing, legal, and authentication routes should not be sent
  // through the session gate. Their host canonicalization above is separate
  // from authorization so the same app build can serve both domains safely.
  if (!isProtectedAppPath(request.nextUrl.pathname)) return NextResponse.next();

  const response = NextResponse.next();
  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
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
    const access = await assertApplicationAccess(
      String(data.claims.sub),
      String(data.claims.email),
      typeof data.claims.iat === "number" ? data.claims.iat : null,
    ).catch(() => null);
    if (access) return response;
  }

  const login = new URL("/login", env.appUrl);
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
    "/privacy/:path*",
    "/terms/:path*",
    "/data-deletion/:path*",
    "/support/:path*",
    "/dashboard/:path*",
    "/activity/:path*",
    "/automations/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/help/:path*",
    "/admin/:path*",
  ],
};
