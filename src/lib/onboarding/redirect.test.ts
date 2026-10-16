import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adoptOnboardingIdentity,
  clearOnboardingDeferral,
  clearOnboardingTabFlags,
  deferOnboarding,
  mayRedirectToOnboarding,
  ONBOARDING_DEFER_MS,
  ONBOARDING_DEFERRED_KEY,
  ONBOARDING_IDENTITY_KEY,
  ONBOARDING_NOT_REQUIRED_KEY,
  onboardingKnownNotRequired,
  readOnboardingDeferral,
  rememberOnboardingNotRequired,
  shouldRedirectToOnboarding,
} from "./redirect";
import type { OnboardingSummary } from "./status";

const needed: OnboardingSummary = { required: true, flow: "owner", invite: false, planCard: false, goals: [], displayName: null };

describe("shouldRedirectToOnboarding", () => {
  it("sends a person who still needs onboarding there from any workspace page", () => {
    expect(shouldRedirectToOnboarding(needed, "/dashboard", "")).toBe(true);
    expect(shouldRedirectToOnboarding(needed, "/automations/new", "?type=classic")).toBe(true);
  });

  it("never redirects when onboarding is done, skipped or unknown", () => {
    expect(shouldRedirectToOnboarding({ ...needed, required: false }, "/dashboard", "")).toBe(false);
    expect(shouldRedirectToOnboarding(null, "/dashboard", "")).toBe(false);
    expect(shouldRedirectToOnboarding(undefined, "/dashboard", "")).toBe(false);
  });

  it("never loops on onboarding itself, API routes, auth pages or previews", () => {
    for (const path of ["/onboarding", "/onboarding/x", "/api/onboarding", "/auth/confirm", "/dev-preview/workspace/dashboard"]) {
      expect(shouldRedirectToOnboarding(needed, path, "")).toBe(false);
    }
  });

  it("leaves Settings alone while it shows a connect or billing result", () => {
    expect(shouldRedirectToOnboarding(needed, "/settings", "?meta=connected")).toBe(false);
    expect(shouldRedirectToOnboarding(needed, "/settings", "?facebook=select-page")).toBe(false);
    expect(shouldRedirectToOnboarding(needed, "/settings", "?section=billing")).toBe(false);
    expect(shouldRedirectToOnboarding(needed, "/settings", "?section=team")).toBe(true);
  });

  it("puts onboarding before the checkout of a plan picked on /pricing", () => {
    expect(shouldRedirectToOnboarding(needed, "/settings", "?section=billing&plan=growth&interval=annual")).toBe(true);
    expect(shouldRedirectToOnboarding({ ...needed, required: false }, "/settings", "?section=billing&plan=growth&interval=annual")).toBe(false);
  });
});

describe("onboarding deferral", () => {
  const now = Date.parse("2026-10-16T10:00:00.000Z");

  it("holds the redirect off for 30 minutes after a deferral, then asks again", () => {
    expect(shouldRedirectToOnboarding(needed, "/dashboard", "", now - 1_000, now)).toBe(false);
    expect(shouldRedirectToOnboarding(needed, "/dashboard", "", now - ONBOARDING_DEFER_MS + 1, now)).toBe(false);
    expect(shouldRedirectToOnboarding(needed, "/dashboard", "", now - ONBOARDING_DEFER_MS, now)).toBe(true);
    expect(shouldRedirectToOnboarding(needed, "/dashboard", "", null, now)).toBe(true);
    // A timestamp from the future (a clock change) is not a deferral.
    expect(shouldRedirectToOnboarding(needed, "/dashboard", "", now + 60_000, now)).toBe(true);
  });

  it("tells whether a page could be redirected before the bootstrap answers", () => {
    expect(mayRedirectToOnboarding("/dashboard", "", null, now)).toBe(true);
    expect(mayRedirectToOnboarding("/settings", "?meta=connected", null, now)).toBe(false);
    expect(mayRedirectToOnboarding("/dashboard", "", now - 1_000, now)).toBe(false);
  });

  describe("tab storage", () => {
    function stubStorage(blocked = false) {
      const values = new Map<string, string>();
      const storage = {
        getItem: (key: string) => { if (blocked) throw new Error("blocked"); return values.get(key) ?? null; },
        setItem: (key: string, value: string) => { if (blocked) throw new Error("blocked"); values.set(key, value); },
        removeItem: (key: string) => { if (blocked) throw new Error("blocked"); values.delete(key); },
      };
      vi.stubGlobal("window", { sessionStorage: storage });
      return values;
    }

    afterEach(() => vi.unstubAllGlobals());

    it("stores, reads and clears the deferral and the not-required flag", () => {
      const values = stubStorage();
      expect(readOnboardingDeferral()).toBeNull();
      deferOnboarding(now);
      expect(values.get(ONBOARDING_DEFERRED_KEY)).toBe(String(now));
      expect(readOnboardingDeferral()).toBe(now);
      clearOnboardingDeferral();
      expect(readOnboardingDeferral()).toBeNull();

      expect(onboardingKnownNotRequired()).toBe(false);
      rememberOnboardingNotRequired(true);
      expect(onboardingKnownNotRequired()).toBe(true);
      rememberOnboardingNotRequired(false);
      expect(onboardingKnownNotRequired()).toBe(false);
    });

    it("drops the flags when a different account signs in on the same tab", () => {
      const values = stubStorage();
      adoptOnboardingIdentity("first@example.com");
      deferOnboarding(now);
      rememberOnboardingNotRequired(true);
      // The same account (any case) keeps them.
      adoptOnboardingIdentity("First@Example.com");
      expect(readOnboardingDeferral()).toBe(now);
      expect(onboardingKnownNotRequired()).toBe(true);
      // The email itself is never stored.
      expect(values.get(ONBOARDING_IDENTITY_KEY)).not.toContain("example");

      adoptOnboardingIdentity("second@example.com");
      expect(readOnboardingDeferral()).toBeNull();
      expect(onboardingKnownNotRequired()).toBe(false);
    });

    it("keeps a deferral made before any account was known on this tab", () => {
      stubStorage();
      deferOnboarding(now);
      adoptOnboardingIdentity("first@example.com");
      expect(readOnboardingDeferral()).toBe(now);
      // An empty email changes nothing.
      adoptOnboardingIdentity("");
      expect(readOnboardingDeferral()).toBe(now);
    });

    it("clears every onboarding flag for this tab on sign-out or a sign-in page, leaving other keys alone", () => {
      const values = stubStorage();
      values.set("linkar:home-range", "30");
      adoptOnboardingIdentity("first@example.com");
      deferOnboarding(now);
      rememberOnboardingNotRequired(true);
      expect([...values.keys()].sort()).toEqual([ONBOARDING_DEFERRED_KEY, ONBOARDING_IDENTITY_KEY, ONBOARDING_NOT_REQUIRED_KEY, "linkar:home-range"].sort());

      clearOnboardingTabFlags();
      expect([...values.keys()]).toEqual(["linkar:home-range"]);
      expect(readOnboardingDeferral()).toBeNull();
      expect(onboardingKnownNotRequired()).toBe(false);

      // The next account on this tab starts clean: nothing of the last one carries over.
      adoptOnboardingIdentity("second@example.com");
      expect(readOnboardingDeferral()).toBeNull();
      // Clearing again with nothing stored is harmless.
      expect(() => clearOnboardingTabFlags()).not.toThrow();
    });

    it("never throws when the browser blocks storage", () => {
      stubStorage(true);
      expect(() => clearOnboardingTabFlags()).not.toThrow();
      expect(() => adoptOnboardingIdentity("first@example.com")).not.toThrow();
      expect(() => deferOnboarding(now)).not.toThrow();
      expect(() => clearOnboardingDeferral()).not.toThrow();
      expect(() => rememberOnboardingNotRequired(true)).not.toThrow();
      expect(readOnboardingDeferral()).toBeNull();
      expect(onboardingKnownNotRequired()).toBe(false);
    });
  });
});
