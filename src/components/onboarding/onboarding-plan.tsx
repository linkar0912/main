"use client";

import type { CSSProperties } from "react";
import { ArrowRight, MessageSquare } from "lucide-react";
import { useCountUp } from "../use-count-up";
import type { OnboardingPlan } from "@/src/lib/onboarding/build-plan";
import { formatDurationRange, SECONDS_PER_REPLY } from "@/src/lib/onboarding/plan";
import styles from "./onboarding.module.css";

const numberFormat = new Intl.NumberFormat("en-IN");

function rupees(paise: number): string {
  return `₹${numberFormat.format(Math.round(paise / 100))}`;
}

function delay(ms: number): CSSProperties {
  return { "--reveal-delay": `${ms}ms` } as CSSProperties;
}

/** "about 5 in 10" from 0.5. */
function inTen(share: number): string {
  return `about ${Math.round(share * 10)} in 10`;
}

function TimeBackBlock({ plan }: { plan: OnboardingPlan }) {
  const time = plan.timeBack;
  const range = time ? formatDurationRange(time.minutesLow, time.minutesHigh) : null;
  const missed = time?.kind === "missed";
  const low = useCountUp(range ? (missed ? time.handledPerMonth : range.low) : null, { duration: 620, delay: 160 });
  const high = useCountUp(range && !missed ? range.high : null, { duration: 620, delay: 160 });
  if (!time || !range) return null;

  const figure = missed ? numberFormat.format(low ?? 0) : `${low ?? 0}–${high ?? 0}`;
  const unit = missed ? "messages a month could get an answer" : `${range.unit} a month back`;
  const spoken = missed
    ? `${numberFormat.format(time.handledPerMonth)} messages a month could get an answer`
    : `${range.low} to ${range.high} ${range.unit} a month back`;
  return (
    <section className={`${styles.planHero} ${styles.reveal}`} style={delay(0)} aria-label="Time Linkar can take off you">
      <p className={styles.planFigure} aria-hidden="true">
        <span className={styles.planNumber}>{figure}</span>
        <span className={styles.planUnit}>{unit}</span>
      </p>
      <p className="sr-only">{spoken}</p>
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

export function OnboardingPlanView({ plan, onOpen }: { plan: OnboardingPlan; onOpen: (href: string) => void }) {
  const posts = plan.posts;
  const fit = plan.planFit;
  return (
    <div className={styles.plan}>
      <TimeBackBlock plan={plan} />

      {posts ? (
        <p className={`${styles.planPosts} ${styles.reveal}`} style={delay(120)}>
          <MessageSquare size={18} aria-hidden />
          <span>
            Your last {posts.posts} post{posts.posts === 1 ? "" : "s"} on @{posts.username} got {numberFormat.format(posts.comments)} comment{posts.comments === 1 ? "" : "s"}
            {posts.over ? `; ${posts.over.count} had ${posts.over.threshold} or more.` : "."}
          </span>
        </p>
      ) : null}

      <section className={styles.planPicks} aria-labelledby="plan-picks-title">
        <h2 id="plan-picks-title" className={`${styles.planSubhead} ${styles.reveal}`} style={delay(180)}>Start with these</h2>
        <ol className={styles.planCards}>
          {plan.recommendations.map((item, index) => (
            <li key={item.id} className={`${styles.planCard} ${styles.reveal}`} style={delay(220 + index * 45)}>
              <strong className={styles.planCardTitle}>{item.title}</strong>
              <span className={styles.planCardWhy}>{item.why}</span>
              <button type="button" className={styles.planCardAction} onClick={() => onOpen(item.href)}>
                Set this up <ArrowRight size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      </section>

      {fit ? (
        <p className={`${styles.planFit} ${styles.reveal}`} style={delay(400)}>
          {fit.key === "free" ? (
            <>The Free plan fits you for now: about {numberFormat.format(fit.estimatedMessages)} messages a month, inside its {numberFormat.format(fit.monthlyDeliveryLimit)}.</>
          ) : fit.reason === "team" ? (
            <>{fit.name} fits a team: it adds a second seat and {numberFormat.format(fit.monthlyDeliveryLimit)} messages a month for {rupees(fit.monthlyPaise)} a month.</>
          ) : (
            <>{fit.name} fits your volume: about {numberFormat.format(fit.estimatedMessages)} messages a month, inside its {numberFormat.format(fit.monthlyDeliveryLimit)} for {rupees(fit.monthlyPaise)} a month.</>
          )}
          {plan.currentPlan === fit.key ? " You’re already on it." : fit.key === "free" ? "" : " You can change plans any time in Billing."}
          <span className={styles.planFitNote}> Counted as about 2 messages per conversation: a reply and a DM.</span>
        </p>
      ) : null}
    </div>
  );
}
