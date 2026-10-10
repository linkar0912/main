"use client";

import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import { FacebookGlyph } from "../facebook-glyph";
import { InstagramGlyph } from "../instagram-glyph";
import { formatRupees, signupHref } from "./pricing-format";
import { usePricingInterval } from "./pricing-interval";
import { Reveal } from "./reveal";
import styles from "./pricing-page.module.css";

const plans = [FREE_BILLING_PLAN, ...Object.values(BILLING_PLANS)];

/** Each answer names the smallest plan that can carry it. The finder keeps the largest one. */
type FinderStep = {
  id: string;
  label: string;
  question: string;
  hint: string;
  multiple?: true;
  options: { id: string; label: string; tier: number; channel?: "instagram" | "facebook" }[];
};

/**
 * Channels are only the ones Linkar runs: Instagram comments, DMs, and story
 * replies, and public replies to Facebook Page comments. Messenger is not
 * supported (see /support), so it is not offered here.
 */
const finderSteps: FinderStep[] = [
  {
    id: "channels",
    label: "Channels",
    question: "Where do people find you?",
    hint: "Pick the places where conversations actually start.",
    multiple: true,
    options: [
      { id: "ig-comments", label: "Instagram comments", tier: 0, channel: "instagram" },
      { id: "ig-dms", label: "Instagram DMs", tier: 0, channel: "instagram" },
      { id: "ig-stories", label: "Story replies", tier: 1, channel: "instagram" },
      { id: "fb-comments", label: "Facebook Page comments", tier: 0, channel: "facebook" },
    ],
  },
  {
    id: "accounts",
    label: "Accounts",
    question: "How many accounts do you run?",
    hint: "Every Instagram profile and Facebook Page you connect counts as one.",
    options: [
      { id: "one", label: "Just one", tier: 0 },
      { id: "few", label: "Two or three", tier: 1 },
      { id: "several", label: "Four to eight", tier: 2 },
      { id: "many", label: "More than eight", tier: 3 },
    ],
  },
  {
    id: "volume",
    label: "Monthly replies",
    question: "How many replies go out each month?",
    hint: "Count every comment reply, direct message, and follow-up Linkar sends for you.",
    options: [
      { id: "starter", label: "Under 1,000", tier: 0 },
      { id: "steady", label: "1,000 to 5,000", tier: 1 },
      { id: "busy", label: "5,000 to 25,000", tier: 2 },
      { id: "heavy", label: "More than 25,000", tier: 3 },
    ],
  },
  {
    id: "team",
    label: "Team",
    question: "Who works on this with you?",
    hint: "Seats decide who can build automations and read the conversations.",
    options: [
      { id: "solo", label: "Just me", tier: 0 },
      { id: "duo", label: "Me and one other", tier: 1 },
      { id: "small", label: "A team of about five", tier: 2 },
      { id: "agency", label: "An agency crew", tier: 3 },
    ],
  },
];

/** Sample threads for the finder preview: the conversation a visitor would
 *  actually see on the channel they picked, in Linkar's own bubble language.
 *  Facebook Page replies are public comment replies, so that sample answers
 *  in the comment thread rather than moving to an inbox. */
const channelThreads: Record<string, { handle: string; channel: "instagram" | "facebook"; note: string; incoming: string; reply: string }> = {
  "ig-comments": { handle: "@arjun.builds", channel: "instagram", note: "Commented on your reel", incoming: "price?", reply: "Just sent the details to your DMs." },
  "ig-dms": { handle: "@meera.k", channel: "instagram", note: "Direct message", incoming: "Do you ship to Pune?", reply: "We do, in two to three days. Want the link?" },
  "ig-stories": { handle: "@nikhil.rr", channel: "instagram", note: "Replied to your story", incoming: "need this", reply: "It is live now. Here is the link." },
  "fb-comments": { handle: "Priya Nair", channel: "facebook", note: "Commented on your Page post", incoming: "Is this still available?", reply: "Yes, it is! Every size is in stock this week." },
};

const defaultThread = { handle: "@yourhandle", channel: "instagram" as const, note: "Pick a channel to see it", incoming: "price?", reply: "Linkar answers here, in your voice." };

export function PlanFinder() {
  const interval = usePricingInterval();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [finished, setFinished] = useState(false);

  const step = finderSteps[stepIndex];
  const picked = answers[step.id] ?? [];
  const isLastStep = stepIndex === finderSteps.length - 1;

  const recommendedTier = useMemo(() => {
    let tier = 0;
    for (const entry of finderSteps) {
      for (const optionId of answers[entry.id] ?? []) {
        const option = entry.options.find((candidate) => candidate.id === optionId);
        if (option && option.tier > tier) tier = option.tier;
      }
    }
    return tier;
  }, [answers]);

  const recommended = plans[recommendedTier];
  const answeredCount = finderSteps.filter((entry) => (answers[entry.id] ?? []).length > 0).length;
  const thread = channelThreads[(answers.channels ?? [])[0] ?? ""] ?? defaultThread;

  function toggleOption(optionId: string) {
    setAnswers((current) => {
      const existing = current[step.id] ?? [];
      if (!step.multiple) return { ...current, [step.id]: existing[0] === optionId ? [] : [optionId] };
      return {
        ...current,
        [step.id]: existing.includes(optionId)
          ? existing.filter((value) => value !== optionId)
          : [...existing, optionId],
      };
    });
  }

  function restart() {
    setAnswers({});
    setStepIndex(0);
    setFinished(false);
  }

  return (
    <section className={styles.finder} id="plan-finder" aria-labelledby="plan-finder-title">
      <Reveal className={styles.finderCard}>
        <div className={styles.finderAsk}>
          <h2 className={styles.finderKicker} id="plan-finder-title">Pick your plan in 30 seconds</h2>

          {finished ? (
            <div className={styles.finderResult}>
              <p className={styles.finderResultLead}>Your plan</p>
              <p className={styles.finderResultPlan}>{recommended.name}</p>
              <p className={styles.finderResultPrice}>
                <strong>{formatRupees(interval === "ANNUAL" ? recommended.annualPaise : recommended.monthlyPaise)}</strong>
                <span>/{interval === "ANNUAL" ? "year" : "month"}</span>
              </p>
              <ul className={styles.finderResultFacts}>
                <li>
                  <Check size={16} aria-hidden="true" />
                  {recommended.monthlyDeliveryLimit.toLocaleString("en-IN")} deliveries a month
                </li>
                <li>
                  <Check size={16} aria-hidden="true" />
                  {recommended.automationLimit} automations across {recommended.instagramConnectionLimit + recommended.facebookConnectionLimit} accounts
                </li>
                <li>
                  <Check size={16} aria-hidden="true" />
                  {recommended.memberLimit} {recommended.memberLimit === 1 ? "seat" : "seats"} in the workspace
                </li>
              </ul>
              <div className={styles.finderFoot}>
                <button className={styles.finderBack} type="button" onClick={restart}>Start over</button>
                <Link className={styles.finderNext} href={signupHref(recommended.key, interval)} prefetch={false}>
                  Start with {recommended.name}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
          ) : (
            <div className={styles.finderStep} key={step.id}>
              <ol className={styles.finderTrack} aria-label={`Step ${stepIndex + 1} of ${finderSteps.length}`}>
                {finderSteps.map((entry, index) => (
                  <li key={entry.id} data-state={index === stepIndex ? "current" : index < stepIndex ? "done" : "todo"}>
                    <span>{entry.label}</span>
                  </li>
                ))}
              </ol>

              <h3 className={styles.finderQuestion}>{step.question}</h3>
              <p className={styles.finderHint}>{step.hint}</p>

              <div className={styles.finderOptions} role="group" aria-label={step.label}>
                <p className={styles.finderOptionsLabel}>{step.label}</p>
                <div className={styles.finderChips}>
                  {step.options.map((option) => {
                    const selected = picked.includes(option.id);
                    return (
                      <button
                        className={styles.finderChip}
                        type="button"
                        key={option.id}
                        data-selected={selected || undefined}
                        aria-pressed={selected}
                        onClick={() => toggleOption(option.id)}
                      >
                        {option.channel === "instagram" ? <InstagramGlyph size={15} brand /> : null}
                        {option.channel === "facebook" ? <FacebookGlyph size={15} brand /> : null}
                        {option.label}
                        <span aria-hidden="true">{selected ? "✓" : "+"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.finderFoot}>
                <button
                  className={styles.finderBack}
                  type="button"
                  onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
                  disabled={stepIndex === 0}
                >
                  Back
                </button>
                <button
                  className={styles.finderNext}
                  type="button"
                  disabled={picked.length === 0}
                  onClick={() => (isLastStep ? setFinished(true) : setStepIndex((index) => index + 1))}
                >
                  {isLastStep ? "See my plan" : "Next step"}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className={styles.finderPreview} aria-label="Your answers so far">
          <figure className={styles.thread} aria-hidden="true">
            <figcaption className={styles.threadHead}>
              <span className={styles.threadAvatar}>{thread.handle.replace("@", "").charAt(0).toUpperCase()}</span>
              <span className={styles.threadWho}>
                <strong>{thread.handle}</strong>
                <span>{thread.note}</span>
              </span>
              {thread.channel === "instagram" ? <InstagramGlyph size={16} brand /> : <FacebookGlyph size={16} brand />}
            </figcaption>
            <p className={styles.threadIncoming}>{thread.incoming}</p>
            <p className={styles.threadReply}>{thread.reply}</p>
            <span className={styles.threadTyping}>
              <i /><i /><i />
            </span>
          </figure>

          <dl className={styles.previewStats}>
            {finderSteps.map((entry, index) => {
              const values = (answers[entry.id] ?? [])
                .map((optionId) => entry.options.find((option) => option.id === optionId)?.label)
                .filter(Boolean);
              return (
                <div key={entry.id} data-filled={values.length > 0 || undefined} style={{ "--row": index } as CSSProperties}>
                  <dt>{entry.label}</dt>
                  <dd>{values.length > 0 ? values.join(", ") : "Not set yet"}</dd>
                </div>
              );
            })}
          </dl>

          <p className={styles.finderPreviewNote} aria-live="polite">
            {answeredCount === 0
              ? "Answer the questions and the right plan lands here."
              : `Looks like ${recommended.name} so far.`}
          </p>
        </aside>
      </Reveal>
    </section>
  );
}
