import { NextResponse } from "next/server";
import { getRequestOrigin, OWNER_SESSION_COOKIE } from "@/src/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", getRequestOrigin(request)), 303);
  response.cookies.set({ name: OWNER_SESSION_COOKIE, value: "", expires: new Date(0), path: "/" });
  return response;
}
