import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getOwnerSessionFromRequest } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";

export function proxy(request: NextRequest) {
  if (getOwnerSessionFromRequest(request)) return NextResponse.next();
  const login = new URL("/login", getServerEnv().appUrl);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/automations/:path*", "/settings/:path*"],
};
