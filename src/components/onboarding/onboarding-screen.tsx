"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LinkarMark } from "../linkar-mark";
import { backoffDelay, invalidateWorkspaceResource } from "@/src/lib/client/workspace-data";
import { clearOnboardingDeferral, deferOnboarding } from "@/src/lib/onboarding/redirect";
import type { OnboardingView } from "@/src/lib/onboarding/view";
import { onboardingExitPath, type PlanIntent } from "@/src/lib/billing/plan-intent";
import { createOnboardingClient, type OnboardingSave } from "./onboarding-client";
import { OnboardingFlow, type ConnectReturn } from "./onboarding-flow";
import styles from "./onboarding-screen.module.css";

/** "Try again" waits 2 s, 4 s, 8 s... (up to 30 s) after each failure in a row. */
const RETRY_BASE_MS = 2_000;
const RETRY_CAP_MS = 30_000;
/** After this many failures in a row the message stops asking for retries. */
const CALM_AFTER_FAILURES = 3;

/**
 * PUT /api/onboarding, as onboarding-client.ts sends it, but a failure
 * carries the HTTP status so the flow's save queue can tell "try again
 * later" (a 502) from a refusal a resend cannot change (signed out, not
 * allowed, a rejected answer), and never resends those.
 */
async function saveOnboarding(body: OnboardingSave): Promise<OnboardingView> {
  const response = await fetch("/api/onboarding", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: OnboardingView; error?: string };
  if (response.ok && payload.data !== undefined) return payload.data;
  throw Object.assign(new Error(payload.error ?? "Could not save your answers"), { status: response.status });
}

/**
 * /onboarding: loads where the person left off, then runs the flow. With a
 * paid plan picked on /pricing (`planIntent`), the owner leaves for that
 * plan's checkout in Billing wherever the flow would go Home.
 */
export function OnboardingScreen({ connectReturn, planIntent }: { connectReturn?: ConnectReturn; planIntent?: PlanIntent | null }) {
  const router = useRouter();
  const [view, setView] = useState<OnboardingView | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Failures in a row: each one makes "Try again" wait longer before it can
  // be pressed, so a struggling server is not asked again and again.
  const [failures, setFailures] = useState(0);
  const [coolingDown, setCoolingDown] = useState(false);
  // Only the owner can pay, so only the owner flow honours the intent. The
  // view is set once, before the flow mounts, so its client stays stable.
  const exitIntent = view?.flow === "owner" ? planIntent ?? null : null;

  const navigate = useCallback((href: string) => {
    // The shell decides whether to send people here from the cached
    // bootstrap; drop it so a finished or skipped onboarding is seen at once.
    invalidateWorkspaceResource("bootstrap");
    router.push(onboardingExitPath(href, exitIntent));
  }, [router, exitIntent]);
  const client = useMemo(() => ({ ...createOnboardingClient(navigate), save: saveOnboarding }), [navigate]);

  useEffect(() => {
    let active = true;
    fetch("/api/onboarding")
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login?next=/onboarding");
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as { data?: OnboardingView };
        if (!response.ok || !payload.data) throw new Error("unavailable");
        if (!active) return;
        clearOnboardingDeferral();
        setFailures(0);
        setView(payload.data);
      })
      .catch(() => {
        if (!active) return;
        // Home must not send them straight back here while this keeps
        // failing (app shell, shouldRedirectToOnboarding).
        deferOnboarding();
        setFailures((count) => count + 1);
        setCoolingDown(true);
        setFailed(true);
      });
    return () => { active = false; };
  }, [attempt, router]);

  useEffect(() => {
    if (!coolingDown || failures === 0) return;
    const timer = window.setTimeout(() => setCoolingDown(false), backoffDelay(failures, { baseMs: RETRY_BASE_MS, capMs: RETRY_CAP_MS }));
    return () => window.clearTimeout(timer);
  }, [coolingDown, failures]);

  if (view) return <OnboardingFlow view={view} client={client} connectReturn={connectReturn} />;

  const calm = failures >= CALM_AFTER_FAILURES;

  return (
    <div className={styles.wait} aria-busy={!failed}>
      <LinkarMark className={styles.mark} />
      {failed ? (
        <div className={styles.failed} role="alert">
          {calm ? (
            <p>Setup is taking longer than usual to load. You can carry on from Home and come back to it later.</p>
          ) : (
            <p>Your setup couldn’t load just now.</p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={`button ${calm ? "button-secondary" : "button-primary"}`}
              disabled={coolingDown}
              onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}
            >
              Try again
            </button>
            <button type="button" className={`button ${calm ? "button-primary" : "button-secondary"}`} onClick={() => navigate("/dashboard")}>Go to Home</button>
          </div>
        </div>
      ) : (
        <p className="sr-only" role="status">Loading your setup…</p>
      )}
    </div>
  );
}
