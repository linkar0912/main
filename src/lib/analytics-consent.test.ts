import { describe, expect, it } from "vitest";
import { ANALYTICS_CONSENT_COOKIE, analyticsConsentCookieDomain, parseAnalyticsConsent } from "./analytics-consent";

describe("parseAnalyticsConsent", () => {
  it("reads only the two valid choices from a cookie header", () => {
    expect(parseAnalyticsConsent(`a=1; ${ANALYTICS_CONSENT_COOKIE}=granted; b=2`)).toBe("granted");
    expect(parseAnalyticsConsent(`${ANALYTICS_CONSENT_COOKIE}=denied`)).toBe("denied");
    expect(parseAnalyticsConsent(`${ANALYTICS_CONSENT_COOKIE}=yes`)).toBeNull();
    expect(parseAnalyticsConsent("_ga=GA1.1.1")).toBeNull();
    expect(parseAnalyticsConsent("")).toBeNull();
  });
});

describe("analyticsConsentCookieDomain", () => {
  it("shares the choice across linkar.in hosts and stays host-only elsewhere", () => {
    expect(analyticsConsentCookieDomain("linkar.in")).toBe("linkar.in");
    expect(analyticsConsentCookieDomain("app.linkar.in")).toBe("linkar.in");
    expect(analyticsConsentCookieDomain("localhost")).toBeUndefined();
    expect(analyticsConsentCookieDomain("notlinkar.in")).toBeUndefined();
  });
});
