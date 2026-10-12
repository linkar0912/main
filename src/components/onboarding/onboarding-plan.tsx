"use client";

import { MessageSquare } from "lucide-react";
import type { OnboardingPlan } from "@/src/lib/onboarding/build-plan";
import { formatDurationRange, SECONDS_PER_REPLY } from "@/src/lib/onboarding/plan";
import styles from "./onboarding.module.css";

const numberFormat = new Intl.NumberFormat("en-IN");

function rupees(paise: number): string {
  return `₹${numberFormat.format(Math.round(paise / 100))}`;
}

/** "about 5 in 10" from 0.5. */
function inTen(share: number): string {
  return `about ${Math.round(share * 10)} in 10`;
}

/** The estimate as one plain line, with the working under it. */
function TimeBackBlock({ plan }: { plan: OnboardingPlan }) {
  const time = plan.timeBack;
  const range = time ? formatDurationRange(time.minutesLow, time.minutesHigh) : null;
  if (!time || !range) return null;
  const missed = time.kind === "missed";
  return (
    <section className={styles.planEstimate} aria-label="Time Linkar can take off you">
      <p className={styles.planFigure}>
        {missed
          ? `About ${numberFormat.format(time.handledPerMonth)} more messages a month answered`
          : `About ${range.low}–${range.high} ${range.unit} a month saved`}
      </p>
      <p className={styles.planAssumption}>
        {missed ? (
          <>Based on about {numberFormat.format(time.perDay)} comments and messages a day, {inTen(time.share)} of them about what you picked. Most of them go unanswered today; answering them by hand would take {range.low} to {range.high} {range.unit} a month.</>
        ) : (
          <>Based on about {numberFormat.format(time.perDay)} comments and messages a day, {inTen(time.share)} of them about what you picked, and about {SECONDS_PER_REPLY.low} to {SECONDS_PER_REPLY.high} seconds to answer each one by hand.</>
        )}
      </p>
    </section>
  );
}

export function OnboardingPlanView({ plan, busy = false, onOpen }: { plan: OnboardingPlan; busy?: boolean; onOpen: (href: string) => void }) {
  const posts = plan.posts;
  const fit = plan.planFit;
  return (
    <div className={styles.plan}>
      <TimeBackBlock plan={plan} />

      {posts ? (
        <p className={styles.planPosts}>
          <MessageSquare size={16} aria-hidden="true" />
          <span>
            Your last {posts.posts} post{posts.posts === 1 ? "" : "s"} on @{posts.username} got {numberFormat.format(posts.comments)} comment{posts.comments === 1 ? "" : "s"}
            {posts.over ? `; ${posts.over.count} had ${posts.over.threshold} or more.` : "."}
          </span>
        </p>
      ) : null}

      <section className={styles.planPicks} aria-labelledby="plan-picks-title">
        <h2 id="plan-picks-title" className={styles.planSubhead}>Recommended automations</h2>
        <ul className={styles.planList}>
          {plan.recommendations.map((item) => (
            <li key={item.id} className={styles.planRow}>
              <span className={styles.planRowCopy}>
                <strong>{item.title}</strong>
                <span>{item.why}</span>
              </span>
              <button
                type="button"
                className={`button button-secondary ${styles.planRowAction}`}
                aria-label={`Set up ${item.title}`}
                disabled={busy}
                onClick={() => onOpen(item.href)}
              >
                Set up
              </button>
            </li>
          ))}
        </ul>
      </section>

      {fit ? (
        <p className={styles.planFit}>
          {fit.key === "free" ? (
            <>The Free plan fits you for now: about {numberFormat.format(fit.estimatedMessages)} messages a month, inside its {numberFormat.format(fit.monthlyDeliveryLimit)}.</>
          ) : fit.reason === "team" ? (
            <>{fit.name} fits a team: it adds a second seat and {numberFormat.format(fit.monthlyDeliveryLimit)} messages a month for {rupees(fit.monthlyPaise)} a month.</>
          ) : (
            <>{fit.name} fits your volume: about {numberFormat.format(fit.estimatedMessages)} messages a month, inside its {numberFormat.format(fit.monthlyDeliveryLimit)} for {rupees(fit.monthlyPaise)} a month.</>
          )}
          {plan.currentPlan === fit.key ? " You’re already on it." : fit.key === "free" ? "" : " You can change plans any time in Billing."}
          {" "}Counted as about 2 messages per conversation: a reply and a DM.
        </p>
      ) : null}
    </div>
  );
}
