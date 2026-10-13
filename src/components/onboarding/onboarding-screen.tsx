"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LinkarMark } from "../linkar-mark";
import { invalidateWorkspaceResource } from "@/src/lib/client/workspace-data";
import type { OnboardingView } from "@/src/lib/onboarding/view";
import { onboardingExitPath, type PlanIntent } from "@/src/lib/billing/plan-intent";
import { createOnboardingClient } from "./onboarding-client";
import { OnboardingFlow, type ConnectReturn } from "./onboarding-flow";
import styles from "./onboarding-screen.module.css";

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
  // Only the owner can pay, so only the owner flow honours the intent. The
  // view is set once, before the flow mounts, so its client stays stable.
  const exitIntent = view?.flow === "owner" ? planIntent ?? null : null;

  const navigate = useCallback((href: string) => {
    // The shell decides whether to send people here from the cached
    // bootstrap; drop it so a finished or skipped onboarding is seen at once.
    invalidateWorkspaceResource("bootstrap");
    router.push(onboardingExitPath(href, exitIntent));
  }, [router, exitIntent]);
  const client = useMemo(() => createOnboardingClient(navigate), [navigate]);

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
        if (active) setView(payload.data);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt, router]);

  if (view) return <OnboardingFlow view={view} client={client} connectReturn={connectReturn} />;

  return (
    <div className={styles.wait} aria-busy={!failed}>
      <LinkarMark className={styles.mark} />
      {failed ? (
        <div className={styles.failed} role="alert">
          <p>Your setup couldn’t load just now.</p>
          <div className={styles.actions}>
            <button type="button" className="button button-primary" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Try again</button>
            <button type="button" className="button button-secondary" onClick={() => navigate("/dashboard")}>Go to Home</button>
          </div>
        </div>
      ) : (
        <p className="sr-only" role="status">Loading your setup…</p>
      )}
    </div>
  );
}
