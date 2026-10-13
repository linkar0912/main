import type { NextResponse } from "next/server";
import { sharedAuthCookieDomain } from "@/src/lib/auth/cookie-domain";
import {
  parsePlanIntent,
  PLAN_INTENT_COOKIE,
  PLAN_INTENT_TTL_SECONDS,
  readPlanIntent,
  serializePlanIntent,
  type PlanIntent,
} from "./plan-intent";

type Origins = { appUrl: string; adminUrl: string; publicSiteUrl: string };

/**
 * HttpOnly (only the server reads it), SameSite=Lax (it must survive the
 * top-level OAuth and email-link round trips), and scoped like the session
 * cookie so the marketing and app hosts see the same intent.
 */
export function planIntentCookieOptions(origins: Origins) {
  const domain = sharedAuthCookieDomain(origins);
  return {
    ...(domain ? { domain } : {}),
    path: "/",
    httpOnly: true,
    secure: new URL(origins.appUrl).protocol === "https:",
    sameSite: "lax" as const,
  };
}

export function setPlanIntentCookie(response: NextResponse, intent: PlanIntent, origins: Origins, now = Date.now()): NextResponse {
  response.cookies.set({
    name: PLAN_INTENT_COOKIE,
    value: serializePlanIntent(intent, now),
    ...planIntentCookieOptions(origins),
    maxAge: PLAN_INTENT_TTL_SECONDS,
  });
  return response;
}

export function clearPlanIntentCookie(response: NextResponse, origins: Origins): NextResponse {
  // A cookie set on the parent domain is only removed by naming that domain.
  response.cookies.set({ name: PLAN_INTENT_COOKIE, value: "", ...planIntentCookieOptions(origins), maxAge: 0 });
  return response;
}

/** The intent on a request's Cookie header, if a valid, unexpired one is there. */
export function planIntentFromRequest(request: Request, now = Date.now()): PlanIntent | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== PLAN_INTENT_COOKIE) continue;
    return readPlanIntent(part.slice(separator + 1).trim(), now);
  }
  return null;
}

const AUTH_PAGES = new Set(["/signup", "/login"]);

/**
 * Proxy step for GET /signup and /login: `?plan=&interval=` from a pricing
 * link is remembered for every sign-up path that follows (email, Google,
 * Facebook). An invitation to someone else's workspace is never a purchase,
 * so it drops any intent instead. Other requests are left alone.
 */
export function rememberPlanIntent(
  request: { method: string; nextUrl: URL },
  response: NextResponse,
  origins: Origins,
  now = Date.now(),
): NextResponse {
  if (request.method !== "GET" || !AUTH_PAGES.has(request.nextUrl.pathname)) return response;
  const query = request.nextUrl.searchParams;
  if (query.get("invite")) return clearPlanIntentCookie(response, origins);
  const intent = parsePlanIntent(query.get("plan"), query.get("interval"));
  return intent ? setPlanIntentCookie(response, intent, origins, now) : response;
}
