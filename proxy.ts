import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readSessionToken, safeNextPath, validateSessionState } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";

export async function proxy(request: NextRequest) {
  const repository = getRepository();
  const cookie = request.cookies.get("linkar_session") ?? request.cookies.get("__Host-linkar_session");
  // Cookie name detection is intentionally narrow: in production the active
  // name is __Host-linkar_session, elsewhere linkar_session. We accept both
  // because the auth handler writes whichever the current appUrl calls for.
  const token = cookie?.value;
  if (token) {
    const env = getServerEnv();
    const session = await validateSessionState(
      readSessionToken(token, env.authSessionSecret),
      repository,
    );
    if (session) return NextResponse.next();
  }
  const login = new URL("/login", getServerEnv().appUrl);
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
