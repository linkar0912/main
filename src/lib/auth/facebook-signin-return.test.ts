import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  clearFacebookSignInReturn,
  FACEBOOK_SIGNIN_RETURN_COOKIE,
  readFacebookSignInReturn,
  setFacebookSignInReturn,
} from "./facebook-signin-return";

const SECRET = "test-secret-at-least-32-characters";

const PRODUCTION = {
  appUrl: "https://app.linkar.in",
  adminUrl: "https://admin.linkar.in",
  publicSiteUrl: "https://linkar.in",
  authSessionSecret: SECRET,
};

const LOCAL = {
  appUrl: "http://localhost:3000",
  adminUrl: "http://localhost:3000",
  publicSiteUrl: "http://localhost:3000",
  authSessionSecret: SECRET,
};

/** The Set-Cookie header a fresh redirect carries after `write`. */
function setCookieAfter(write: (response: NextResponse) => NextResponse): string {
  return write(NextResponse.redirect("https://www.facebook.com/dialog/oauth", 303)).headers.get("set-cookie") ?? "";
}

/** The cookie value a Set-Cookie header sets for the return cookie. */
function cookieValue(setCookie: string): string {
  const match = new RegExp(`${FACEBOOK_SIGNIN_RETURN_COOKIE}=([^;]*)`).exec(setCookie);
  return match ? decodeURIComponent(match[1]) : "";
}

function header(value: string): string {
  return `sb-ref-auth-token-code-verifier=abc; ${FACEBOOK_SIGNIN_RETURN_COOKIE}=${encodeURIComponent(value)}`;
}

describe("Facebook sign-in return cookie", () => {
  it("is not an sb- cookie, so the proxy's leftover-session cleanup never touches it", () => {
    expect(FACEBOOK_SIGNIN_RETURN_COOKIE).toBe("linkar_facebook_signin_return");
    expect(FACEBOOK_SIGNIN_RETURN_COOKIE.startsWith("sb-")).toBe(false);
  });

  it("round-trips next and invite", () => {
    const value = cookieValue(setCookieAfter((response) => setFacebookSignInReturn(response, { next: "/automations", invite: "tok" }, LOCAL)));
    expect(readFacebookSignInReturn(header(value), SECRET)).toEqual({ next: "/automations", invite: "tok" });
  });

  it("reads an empty invite when none was stored", () => {
    const value = cookieValue(setCookieAfter((response) => setFacebookSignInReturn(response, { next: "/dashboard" }, LOCAL)));
    expect(readFacebookSignInReturn(header(value), SECRET)).toEqual({ next: "/dashboard", invite: "" });
  });

  it("is shared across linkar.in hosts in production: the start runs on app. or admin., the callback on app.", () => {
    const setCookie = setCookieAfter((response) => setFacebookSignInReturn(response, { next: "/admin" }, PRODUCTION));
    expect(setCookie).toContain("Domain=linkar.in");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=1800");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("stays host-only and not Secure on localhost", () => {
    const setCookie = setCookieAfter((response) => setFacebookSignInReturn(response, { next: "/automations" }, LOCAL));
    expect(setCookie).not.toContain("Domain=");
    expect(setCookie).not.toContain("Secure");
    expect(setCookie).toContain("Max-Age=1800");
  });

  it("rejects a tampered value", () => {
    const value = cookieValue(setCookieAfter((response) => setFacebookSignInReturn(response, { next: "/automations", invite: "tok" }, LOCAL)));
    const [payload, signature] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")), invite: "other" })).toString("base64url");
    expect(readFacebookSignInReturn(header(`${forged}.${signature}`), SECRET)).toBeNull();
    expect(readFacebookSignInReturn(header(`${payload}.${signature}x`), SECRET)).toBeNull();
    expect(readFacebookSignInReturn(header(value), "another-secret-at-least-32-characters")).toBeNull();
    expect(readFacebookSignInReturn(header("not-a-real-value"), SECRET)).toBeNull();
  });

  it("falls back to /dashboard for an unsafe next, and drops an oversized invite", () => {
    for (const next of ["//evil.example", "https://evil.example", "/x\\y"]) {
      const value = cookieValue(setCookieAfter((response) => setFacebookSignInReturn(response, { next }, LOCAL)));
      expect(readFacebookSignInReturn(header(value), SECRET)?.next, next).toBe("/dashboard");
    }
    const value = cookieValue(setCookieAfter((response) => setFacebookSignInReturn(response, { next: "/automations", invite: "x".repeat(513) }, LOCAL)));
    expect(readFacebookSignInReturn(header(value), SECRET)?.invite).toBe("");
  });

  it("expires after 30 minutes", () => {
    const now = Date.parse("2026-10-17T10:00:00Z");
    const value = cookieValue(setCookieAfter((response) => setFacebookSignInReturn(response, { next: "/automations" }, LOCAL, now)));
    expect(readFacebookSignInReturn(header(value), SECRET, now + 29 * 60_000)?.next).toBe("/automations");
    expect(readFacebookSignInReturn(header(value), SECRET, now + 31 * 60_000)).toBeNull();
  });

  it("reads nothing when the request has no such cookie", () => {
    expect(readFacebookSignInReturn(null, SECRET)).toBeNull();
    expect(readFacebookSignInReturn("other=1", SECRET)).toBeNull();
  });

  it("uses a copy that verifies when the browser sends more than one", () => {
    const value = cookieValue(setCookieAfter((response) => setFacebookSignInReturn(response, { next: "/automations", invite: "tok" }, LOCAL)));
    const both = `${FACEBOOK_SIGNIN_RETURN_COOKIE}=${encodeURIComponent(value)}; ${FACEBOOK_SIGNIN_RETURN_COOKIE}=junk`;
    expect(readFacebookSignInReturn(both, SECRET)).toEqual({ next: "/automations", invite: "tok" });
  });

  it("clears the cookie at the same domain and path it was set with", () => {
    const production = setCookieAfter((response) => clearFacebookSignInReturn(response, PRODUCTION));
    expect(production).toContain(`${FACEBOOK_SIGNIN_RETURN_COOKIE}=;`);
    expect(production).toContain("Domain=linkar.in");
    expect(production).toContain("Path=/");
    expect(production).toContain("Max-Age=0");

    const local = setCookieAfter((response) => clearFacebookSignInReturn(response, LOCAL));
    expect(local).toContain(`${FACEBOOK_SIGNIN_RETURN_COOKIE}=;`);
    expect(local).not.toContain("Domain=");
    expect(local).toContain("Max-Age=0");
  });
});
