import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { getSessionFromRequest, sessionCookieName } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const env = getServerEnv();
  // Revoke server-side so the cookie value is dead even if copied before clearing.
  const session = getSessionFromRequest(request);
  if (session?.sid) {
    await getRepository().revokeSession(session.sid, session.userId, new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString());
  }
  const response = NextResponse.redirect(new URL("/login", env.appUrl), 303);
  response.cookies.set({ name: sessionCookieName(env.appUrl), value: "", httpOnly: true, path: "/", maxAge: 0 });
  return response;
}