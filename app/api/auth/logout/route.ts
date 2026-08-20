import { NextResponse } from "next/server";
import { ownerSessionCookieName } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";

export const runtime = "nodejs";

export async function POST() {
  const env = getServerEnv();
  const response = NextResponse.redirect(new URL("/login", env.appUrl), 303);
  response.cookies.set({ name: ownerSessionCookieName(env.appUrl), value: "", expires: new Date(0), path: "/", secure: env.appUrl.startsWith("https://"), httpOnly: true, sameSite: "lax" });
  return response;
}
