import { NextResponse } from "next/server";
import type { SetAllCookies } from "@supabase/ssr";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { ADMIN_HOST, resolveRequestHostname } from "@/src/lib/site-routing";
import { sharedAuthCookieDomain, supabaseAuthCookieOptions } from "@/src/lib/auth/cookie-domain";
import { hostOnlyCookieDeletions, sessionCookieNames, supabaseSessionStorageKey } from "@/src/lib/auth/session-cookie-cleanup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const env = getServerEnv();
  // The client's cookie writes go on the response below, not into the cookie
  // store: Next folds the store into the response one entry per name, which
  // would keep only one of a session cookie's two deletions (shared and
  // host-only).
  const written: Parameters<SetAllCookies>[0] = [];
  const supabase = await createSupabaseServerClient({ setAll: (cookiesToSet) => { written.push(...cookiesToSet); } });
  // signOut() defaults to scope "global" (every session) - pass "local"
  // explicitly so a normal logout only revokes this one session and a copied
  // cookie elsewhere can't be replayed. "Sign out everywhere" lives in
  // /api/account instead.
  const { error } = await supabase.auth.signOut({ scope: "local" });
  const hostname = resolveRequestHostname(request.headers, new URL(request.url).hostname).toLowerCase().replace(/:\d+$/, "");
  // Signing out of the owner console comes back to its own sign-in page, with
  // next=/admin so signing in again returns to the console on this host.
  const login = hostname === ADMIN_HOST ? new URL("/login?next=%2Fadmin", env.adminUrl) : new URL("/login", env.appUrl);
  const response = NextResponse.redirect(login, 303);
  for (const { name, value, options } of written) response.cookies.set(name, value, options);

  const cookieHeader = request.headers.get("cookie");
  const authCookieNames = cookieHeader ? sessionCookieNames(cookieHeader, supabaseSessionStorageKey(env.supabaseUrl)) : [];
  // auth-js removes the session, asking for its cookies to be deleted, even
  // when Supabase Auth failed to revoke it (a 5xx or a network failure): the
  // browser is signed out, but the session stays valid at Supabase until it
  // expires, so a copied cookie still works until then. It keeps the session
  // only when it could not read it at all (Supabase Auth unreachable while
  // the session needed a refresh); then nothing is deleted.
  const signedOut = written.some(({ name, value }) => !value && authCookieNames.includes(name));
  if (error) {
    logger.error("Sign-out could not revoke the session at Supabase Auth", {
      error: error.name,
      status: error.status,
      ...(error.code ? { code: error.code } : {}),
      cookiesCleared: signedOut,
    });
  }
  if (!signedOut) return response;

  // Every session cookie the browser sent is deleted, not only the session
  // the client read: a leftover must not outlive a sign-out.
  const cookieOptions = supabaseAuthCookieOptions(env);
  for (const name of authCookieNames) response.cookies.set(name, "", { ...cookieOptions, maxAge: 0 });
  // Where the session cookies are shared across subdomains, a host-only copy
  // from before the move is deleted too. Appended last, as raw headers,
  // because each response.cookies.set rewrites the Set-Cookie headers.
  if (sharedAuthCookieDomain(env)) {
    for (const deletion of hostOnlyCookieDeletions(authCookieNames, { secure: cookieOptions.secure })) response.headers.append("set-cookie", deletion);
  }
  return response;
}
