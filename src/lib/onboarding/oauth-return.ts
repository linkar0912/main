import type { NextResponse } from "next/server";

/**
 * Lets the existing Instagram / Facebook connect flows come back into
 * onboarding instead of Settings. The start route sees `?return=onboarding`
 * and drops a short-lived cookie; the callback reads it to pick where its
 * status redirect lands. Only the fixed value "onboarding" is honoured, so
 * the cookie can never be turned into an open redirect.
 */
export const OAUTH_RETURN_COOKIE = "linkar_oauth_return";
const ONBOARDING = "onboarding";

export type ConnectChannel = "meta" | "facebook";

export function wantsOnboardingReturn(request: Request): boolean {
  return new URL(request.url).searchParams.get("return") === ONBOARDING;
}

export function readsOnboardingReturn(cookieValue: string | undefined): boolean {
  return cookieValue === ONBOARDING;
}

/** "/onboarding?meta=connected" or the usual "/settings?meta=connected". */
export function connectResultPath(channel: ConnectChannel, status: string, toOnboarding: boolean): string {
  return `${toOnboarding ? "/onboarding" : "/settings"}?${channel}=${encodeURIComponent(status)}`;
}

export function setOnboardingReturnCookie(response: NextResponse, secure: boolean): NextResponse {
  response.cookies.set({
    name: OAUTH_RETURN_COOKIE,
    value: ONBOARDING,
    httpOnly: true,
    sameSite: "lax",
    secure,
    // Same lifetime as the OAuth state cookie it travels with.
    maxAge: 600,
    path: "/",
  });
  return response;
}

export function clearOnboardingReturnCookie(response: NextResponse): NextResponse {
  response.cookies.delete(OAUTH_RETURN_COOKIE);
  return response;
}
