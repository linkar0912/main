import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { clearOnboardingReturnCookie, connectResultPath, OAUTH_RETURN_COOKIE, readsOnboardingReturn, setOnboardingReturnCookie, wantsOnboardingReturn } from "./oauth-return";

describe("OAuth return into onboarding", () => {
  it("only honours the fixed onboarding value", () => {
    expect(wantsOnboardingReturn(new Request("https://app.linkar.in/api/meta/oauth/start?return=onboarding"))).toBe(true);
    expect(wantsOnboardingReturn(new Request("https://app.linkar.in/api/meta/oauth/start?return=https://evil.test"))).toBe(false);
    expect(readsOnboardingReturn("onboarding")).toBe(true);
    expect(readsOnboardingReturn("//evil.test")).toBe(false);
    expect(readsOnboardingReturn(undefined)).toBe(false);
  });

  it("lands the connect result in onboarding or, as before, in Settings", () => {
    expect(connectResultPath("meta", "connected", true)).toBe("/onboarding?meta=connected");
    expect(connectResultPath("facebook", "select-page", false)).toBe("/settings?facebook=select-page");
  });

  it("sets a short-lived http-only cookie and clears it", () => {
    const response = setOnboardingReturnCookie(NextResponse.redirect("https://www.instagram.com/oauth"), true);
    const cookie = response.cookies.get(OAUTH_RETURN_COOKIE);
    expect(cookie).toMatchObject({ value: "onboarding", httpOnly: true, maxAge: 600, secure: true });
    const cleared = clearOnboardingReturnCookie(NextResponse.redirect("https://app.linkar.in/onboarding"));
    expect(cleared.headers.get("set-cookie")).toContain(`${OAUTH_RETURN_COOKIE}=;`);
  });
});
