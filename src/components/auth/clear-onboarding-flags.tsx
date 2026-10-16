"use client";

import { useEffect } from "react";
import { clearOnboardingTabFlags } from "@/src/lib/onboarding/redirect";

/**
 * Rendered on the sign-in and sign-up pages: whoever signs in next on this
 * tab starts without the last account's onboarding deferral or "not
 * required" flag. Renders nothing.
 */
export function ClearOnboardingFlags() {
  useEffect(() => {
    clearOnboardingTabFlags();
  }, []);
  return null;
}
