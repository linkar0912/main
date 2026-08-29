import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeNextPath } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";

// Optimistic gate for page routes only - redirects to /login when there's no
// plausibly valid session. This also refreshes the Supabase session cookie
// (via getClaims()) so it stays fresh across page navigations without every
// page needing its own refresh logic. Each API route still independently
// verifies via getValidatedSession(); Proxy is not the source of truth for
// authorization (see Next.js's Proxy guidance against using it as one).
export async function proxy(request: NextRequest) {
  const env = getServerEnv();
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
  if (!error && data?.claims?.sub) return response;

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
    "/dashboard/:path*",
    "/activity/:path*",
    "/automations/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/help/:path*",
  ],
};
