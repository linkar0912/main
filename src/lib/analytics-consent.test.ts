import { describe, expect, it } from "vitest";
import { ANALYTICS_CONSENT_COOKIE, CONSENT_REQUIRED_REGIONS, analyticsConsentCookieDomain, parseAnalyticsConsent, timeZoneRequiresConsent } from "./analytics-consent";

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

describe("timeZoneRequiresConsent", () => {
  it("asks visitors in European time zones, and errs towards asking when unknown", () => {
    for (const zone of ["Europe/London", "Europe/Berlin", "Europe/Dublin", "Atlantic/Reykjavik", "Atlantic/Canary", undefined]) {
      expect(timeZoneRequiresConsent(zone)).toBe(true);
    }
  });

  it("does not ask everyone else", () => {
    for (const zone of ["Asia/Kolkata", "Asia/Calcutta", "America/New_York", "Asia/Dubai", "Asia/Singapore"]) {
      expect(timeZoneRequiresConsent(zone)).toBe(false);
    }
  });
});

describe("CONSENT_REQUIRED_REGIONS", () => {
  it("covers the EU, the rest of the EEA, the UK and Switzerland, and not India", () => {
    expect(CONSENT_REQUIRED_REGIONS).toHaveLength(32);
    expect(CONSENT_REQUIRED_REGIONS).toEqual(expect.arrayContaining(["DE", "FR", "IE", "IS", "LI", "NO", "GB", "CH"]));
    expect(CONSENT_REQUIRED_REGIONS).not.toContain("IN");
  });
});
