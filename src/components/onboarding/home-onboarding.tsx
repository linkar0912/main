"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { Check, ListChecks, X } from "lucide-react";
import { invalidateWorkspaceResource } from "@/src/lib/client/workspace-data";
import type { OnboardingPlan } from "@/src/lib/onboarding/build-plan";
import { formatDurationRange } from "@/src/lib/onboarding/plan";
import type { OnboardingAction } from "@/src/lib/onboarding/view";
import styles from "./home-onboarding.module.css";

async function sendAction(action: OnboardingAction): Promise<void> {
  await fetch("/api/onboarding", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  }).catch(() => undefined);
  // The shell reads these flags from the bootstrap; drop the cached copy.
  invalidateWorkspaceResource("bootstrap");
}

/**
 * Home, for workspaces that predate onboarding (or skipped it): one quiet
 * invitation. Dismissing it hides it for good.
 */
export function OnboardingInviteCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className={`${styles.invite} home-enter`} aria-labelledby="onboarding-invite-title">
      <span className={styles.inviteMark} aria-hidden="true"><ListChecks size={18} strokeWidth={2} /></span>
      <div className={styles.inviteCopy}>
        <h2 id="onboarding-invite-title">Tell us about your account</h2>
        <p>It takes about a minute, and you get a plan made for you.</p>
      </div>
      <Link className={`button button-secondary ${styles.inviteAction}`} href="/onboarding">Start</Link>
      <button
        type="button"
        className={`icon-button ${styles.dismiss}`}
        aria-label="Dismiss the invitation"
        onClick={() => {
          onDismiss();
          void sendAction("dismiss-invite");
        }}
      >
        <X size={18} aria-hidden />
      </button>
    </section>
  );
}

/** Heads Home's recipe list when it was picked from onboarding goals. */
export function RecommendedLabel() {
  return <p className={styles.recommendedLabel}>Recommended for you</p>;
}

type PlanStep = { label: string; done: boolean };

/**
 * Home after onboarding, until the first automation exists or the person
 * hides it: the time Linkar can take off them as one sentence, a short
 * progress line and the three automations their answers point to.
 */
export function YourPlanCard({ connected, onDismiss, onBrowseTemplates, enterDelay = 0 }: {
  connected: boolean | null;
  onDismiss: () => void;
  onBrowseTemplates: () => void;
  enterDelay?: number;
}) {
  const [plan, setPlan] = useState<OnboardingPlan | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/onboarding/plan")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: OnboardingPlan };
        if (!response.ok || !payload.data) throw new Error("unavailable");
        if (active) setPlan(payload.data);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const steps: PlanStep[] = [
    { label: "Connect an account", done: connected === true },
    { label: "Set up a recommended reply", done: false },
    { label: "Turn it on", done: false },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const time = plan?.timeBack ?? null;
  const range = time ? formatDurationRange(time.minutesLow, time.minutesHigh) : null;

  return (
    <section
      className={`${styles.plan} home-enter`}
      aria-labelledby="your-plan-title"
      style={{ "--enter-delay": `${enterDelay}ms` } as CSSProperties}
    >
      <div className={styles.planHead}>
        <h2 id="your-plan-title">Your plan</h2>
        <button
          type="button"
          className={`icon-button ${styles.dismiss}`}
          aria-label="Hide your plan"
          onClick={() => {
            onDismiss();
            void sendAction("dismiss-plan");
          }}
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {range && time ? (
        <p className={styles.planTime}>
          {time.kind === "missed"
            ? `About ${time.handledPerMonth.toLocaleString("en-IN")} more messages a month answered.`
            : `About ${range.low}–${range.high} ${range.unit} a month saved.`}
          {" "}
          <span>Based on about {time.perDay.toLocaleString("en-IN")} a day, {Math.round(time.share * 10)} in 10 about what you picked.</span>
        </p>
      ) : null}

      <div className={styles.progress}>
        <ol className={styles.progressSteps}>
          {steps.map((step, index) => (
            <li key={step.label} data-done={step.done ? "true" : "false"}>
              <span className={styles.progressNode} aria-hidden="true">{step.done ? <Check size={12} strokeWidth={3} /> : index + 1}</span>
              <span>{step.label}{step.done ? <span className="sr-only"> (done)</span> : null}</span>
            </li>
          ))}
        </ol>
        <p className={styles.progressLabel}>{doneCount} of {steps.length} done</p>
      </div>

      {plan ? (
        <ul className={styles.picks}>
          {plan.recommendations.map((item) => (
            <li key={item.id}>
              <div className={styles.pickCopy}>
                <strong>{item.title}</strong>
                <span>{item.why}</span>
              </div>
              <Link className={`button button-secondary ${styles.pickAction}`} href={item.href} aria-label={`Set up ${item.title}`}>
                Set up
              </Link>
            </li>
          ))}
        </ul>
      ) : failed ? (
        <p className={styles.planNote}>Your recommendations couldn’t load. You can still pick from every template.</p>
      ) : (
        <div className={`skeleton-block ${styles.picksSkeleton}`} aria-hidden="true" />
      )}

      <button type="button" className={`text-link ${styles.browse}`} onClick={onBrowseTemplates}>Browse all templates</button>
    </section>
  );
}
