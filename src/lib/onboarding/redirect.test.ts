import { describe, expect, it } from "vitest";
import { shouldRedirectToOnboarding } from "./redirect";
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
