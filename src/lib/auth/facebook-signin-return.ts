import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { sanitizeInvite } from "@/src/lib/auth/auth-redirect";
import { sharedAuthCookieDomain } from "@/src/lib/auth/cookie-domain";
import { safeNextPath } from "@/src/lib/auth/session";
import { parseCookieHeader } from "@/src/lib/auth/session-cookie-cleanup";

/**
 * Where a Facebook sign-in returns to (`next`) and the invitation it carries
 * (`invite`), kept across the round trip through Supabase and Facebook.
 *
 * They used to ride on Supabase's redirectTo as a query string, but Supabase
 * checks redirectTo against the project's allow list including the query, so
 * the exact entry for the callback stopped matching and Supabase sent people
 * to the Site URL instead. The start route now sends the bare callback URL
 * and keeps these two values here.
 *
 * The name must not start with "sb-": the proxy's leftover-session cleanup
 * (session-cookie-cleanup.ts) only ever looks at Supabase's own cookies. The
 * value is signed, because a sibling linkar.in host can set cookies on the
 * shared domain. It is shared across linkar.in like the session cookies,
 * since the start can run on app. or admin. while the callback always runs
 * on app.
 */
export const FACEBOOK_SIGNIN_RETURN_COOKIE = "linkar_facebook_signin_return";
const MAX_AGE_SECONDS = 30 * 60;

type Origins = { appUrl: string; adminUrl: string; publicSiteUrl: string };

export type FacebookSignInReturn = { next: string; invite: string };

type StoredReturn = { next: string; invite?: string; expiresAt: number };

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function cookieOptions(origins: Origins) {
  const domain = sharedAuthCookieDomain(origins);
  return {
    ...(domain ? { domain } : {}),
    path: "/",
    httpOnly: true,
    secure: new URL(origins.appUrl).protocol === "https:",
    sameSite: "lax" as const,
  };
}

/** Puts next and invite on the response that starts a Facebook sign-in. */
export function setFacebookSignInReturn(
  response: NextResponse,
  value: { next: string; invite?: string },
  env: Origins & { authSessionSecret: string },
  now = Date.now(),
): NextResponse {
  const invite = sanitizeInvite(value.invite);
  const payload = Buffer.from(JSON.stringify({
    next: value.next,
    ...(invite ? { invite } : {}),
    expiresAt: now + MAX_AGE_SECONDS * 1_000,
  } satisfies StoredReturn)).toString("base64url");
  response.cookies.set({
    name: FACEBOOK_SIGNIN_RETURN_COOKIE,
    value: `${payload}.${sign(payload, env.authSessionSecret)}`,
    ...cookieOptions(env),
    maxAge: MAX_AGE_SECONDS,
  });
  return response;
}

function verify(value: string, secret: string, now: number): FacebookSignInReturn | null {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined || secret.length < 32) return null;
  const expected = sign(payload, secret);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<StoredReturn>;
    if (typeof decoded.next !== "string" || typeof decoded.expiresAt !== "number" || decoded.expiresAt <= now) return null;
    return {
      next: safeNextPath(decoded.next),
      invite: typeof decoded.invite === "string" ? sanitizeInvite(decoded.invite) : "",
    };
  } catch {
    return null;
  }
}

/**
 * next and invite from a request's Cookie header, or null when it carries no
 * unexpired cookie whose signature verifies. When the browser sends more
 * than one copy, the last one that verifies wins (Next keeps the last copy).
 */
export function readFacebookSignInReturn(
  cookieHeader: string | null | undefined,
  secret: string,
  now = Date.now(),
): FacebookSignInReturn | null {
  if (!cookieHeader) return null;
  const copies = parseCookieHeader(cookieHeader).filter(({ name }) => name === FACEBOOK_SIGNIN_RETURN_COOKIE);
  for (let index = copies.length - 1; index >= 0; index -= 1) {
    const read = verify(copies[index].value, secret, now);
    if (read) return read;
  }
  return null;
}

/** Deletes the cookie at the domain and path it was set with. */
export function clearFacebookSignInReturn(response: NextResponse, origins: Origins): NextResponse {
  response.cookies.set({ name: FACEBOOK_SIGNIN_RETURN_COOKIE, value: "", ...cookieOptions(origins), maxAge: 0 });
  return response;
}
