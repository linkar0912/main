import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";

export function proxy(request: NextRequest) {
  if (getSessionFromRequest(request)) return NextResponse.next();
  const login = new URL("/login", getServerEnv().appUrl);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/automations/:path*", "/settings/:path*", "/profile/:path*", "/help/:path*"],
};
