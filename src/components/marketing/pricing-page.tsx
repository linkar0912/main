"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import { FacebookGlyph } from "../facebook-glyph";
import { InstagramGlyph } from "../instagram-glyph";
import type { BillingInterval } from "@/src/lib/billing/types";
import { ButtonRoll } from "./button-roll";
import { MarketingFooter } from "./marketing-footer";
import { MarketingHeader } from "./marketing-header";
import { Reveal } from "./reveal";
import marketingStyles from "./marketing-page.module.css";
import styles from "./pricing-page.module.css";

const plans = [FREE_BILLING_PLAN, ...Object.values(BILLING_PLANS)];

const planDescriptions: Record<(typeof plans)[number]["key"], string> = {
  free: "Explore the core workflow for free.",
  creator: "For solo creators building momentum.",
  growth: "For growing creators and small teams.",
  agency: "For teams running high-volume campaigns.",
};

/** Each answer names the smallest plan that can carry it. The finder keeps the largest one. */
type FinderStep = {
  id: string;
  label: string;
  question: string;
  hint: string;
  multiple?: true;
  options: { id: string; label: string; tier: number; channel?: "instagram" | "facebook" }[];
};

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
      { id: "fb-messenger", label: "Messenger", tier: 1, channel: "facebook" },
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

function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function formatLimit(value: number): string {
  return value === 0 ? "Not included" : value.toLocaleString("en-IN");
}

function BillingPeriod({
  name,
  interval,
  onChange,
}: {
  name: string;
  interval: BillingInterval;
  onChange: (next: BillingInterval) => void;
}) {
  return (
    <div className={styles.periodRow}>
      <div className={styles.period} role="group" aria-label="Billing period">
        <span className={styles.periodThumb} data-interval={interval} aria-hidden="true" />
        <label data-active={interval === "MONTHLY"}>
          <input
            type="radio"
            name={name}
            value="MONTHLY"
            checked={interval === "MONTHLY"}
            onChange={() => onChange("MONTHLY")}
          />
          Monthly
        </label>
        <label data-active={interval === "ANNUAL"}>
          <input
            type="radio"
            name={name}
            value="ANNUAL"
            checked={interval === "ANNUAL"}
            onChange={() => onChange("ANNUAL")}
          />
          Annual
        </label>
      </div>
      <span className={styles.periodSaving} aria-hidden="true">Save 2 months</span>
    </div>
  );
}

function PlanFinder({ interval }: { interval: BillingInterval }) {
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
                <Link className={styles.finderNext} href="/signup" prefetch={false}>
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

/**
 * Every line here is the behaviour in src/lib/automation/outbound-delivery.ts:
 * quota is reserved per delivery key before the send, released when the
 * platform rejects it, and counted over the UTC calendar month rather than the
 * billing anniversary. Keep the two in step if the reservation rules change.
 */
const deliveryFacts = [
  {
    term: "One message out, one delivery",
    detail: "Every comment reply, direct message, sequence step, and broadcast message Linkar sends counts once.",
  },
  {
    term: "Nothing counts on the way in",
    detail: "Comments, direct messages, and story replies that arrive cost nothing. Only what Linkar sends is counted.",
  },
  {
    term: "Rejected sends are given back",
    detail: "When the platform turns a send down, the reservation is released. A retry of the same message never counts twice.",
  },
  {
    term: "The count resets on the 1st",
    detail: "Usage is measured over the calendar month in UTC, not from the date you subscribed.",
  },
  {
    term: "At the limit, sending stops",
    detail: "Automations stop sending and report the limit instead of billing you for more. Move up a plan and sending resumes.",
  },
];

/** Sample threads for the finder preview: the conversation a visitor would
 *  actually see on the channel they picked, in Linkar's own bubble language. */
const channelThreads: Record<string, { handle: string; channel: "instagram" | "facebook"; note: string; incoming: string; reply: string }> = {
  "ig-comments": { handle: "@arjun.builds", channel: "instagram", note: "Commented on your reel", incoming: "price?", reply: "Just sent the details to your DMs." },
  "ig-dms": { handle: "@meera.k", channel: "instagram", note: "Direct message", incoming: "Do you ship to Pune?", reply: "We do, in two to three days. Want the link?" },
  "ig-stories": { handle: "@nikhil.rr", channel: "instagram", note: "Replied to your story", incoming: "need this", reply: "It is live now. Here is the link." },
  "fb-comments": { handle: "Priya Nair", channel: "facebook", note: "Commented on your Page", incoming: "Is this still available?", reply: "Yes it is. Replying in your inbox now." },
  "fb-messenger": { handle: "Rohit Shah", channel: "facebook", note: "Messenger", incoming: "Can I book a slot today?", reply: "Sure. Here are the times still open." },
};

const defaultThread = { handle: "@yourhandle", channel: "instagram" as const, note: "Pick a channel to see it", incoming: "price?", reply: "Linkar answers here, in your voice." };

const meterSegments = [
  { kind: "reply", label: "Comment replies", value: "8,500", share: "34%" },
  { kind: "dm", label: "Direct messages", value: "11,250", share: "45%" },
  { kind: "sequence", label: "Sequence steps", value: "4,000", share: "16%" },
  { kind: "broadcast", label: "Broadcast messages", value: "1,250", share: "5%" },
];

/** GST is demonstrated on the invoice itself rather than claimed in a tile. */
const paymentFacts = [
  { term: "Secure checkout", detail: "Subscriptions and payments run on Razorpay, so your card never reaches us." },
  { term: "Pay how you already pay", detail: "UPI, cards, and netbanking, all at Indian rates in rupees." },
  { term: "Cancel anytime", detail: "Your plan runs to the end of the period you paid for, then stops. No exit fee." },
];

/** Official brand SVGs in public/brand/payments. Widths hold each logo's own
 *  aspect ratio at a shared optical height, so they sit level in the row. */
const paymentMarks = [
  { name: "Razorpay", src: "/brand/payments/razorpay.svg", width: 80, height: 17 },
  { name: "Visa", src: "/brand/payments/visa.svg", width: 52, height: 17 },
  { name: "Mastercard", src: "/brand/payments/mastercard.svg", width: 34, height: 26 },
];

const pricingFaq = [
  {
    id: "counts",
    question: "What counts as one delivery?",
    answer: "One outbound message. A comment reply, a direct message, a sequence step, and a broadcast message each count once. Incoming conversations are free, and a send the platform rejects is not counted.",
  },
  {
    id: "limit",
    question: "What happens when I reach the monthly limit?",
    answer: "Automations stop sending and report the limit rather than charging you for more. Nothing is billed beyond your plan. Move up a plan and sending resumes right away.",
  },
  {
    id: "reset",
    question: "When does my usage reset?",
    answer: "On the 1st of each calendar month, in UTC. The reset is tied to the month rather than to the date you subscribed.",
  },
  {
    id: "change",
    question: "Can I change plans in the middle of a cycle?",
    answer: "Yes. The change is scheduled against your Razorpay subscription from the workspace billing settings and takes effect on the next cycle.",
  },
  {
    id: "cancel",
    question: "What happens if I cancel?",
    answer: "Your plan stays active until the end of the period you already paid for. After that the workspace moves to Free and nothing is charged again.",
  },
  {
    id: "card",
    question: "Do I need a card to start?",
    answer: "No. Free needs no card and no billing details. You add them when you move to a paid plan.",
  },
];

function DeliveryExplainer() {
  return (
    <section className={styles.deliveries} aria-labelledby="deliveries-title">
      <Reveal className={styles.deliveriesGrid}>
        <div className={styles.deliveriesLead}>
          <p className={styles.sectionEyebrow}>The unit</p>
          <h2 id="deliveries-title">What counts as a delivery</h2>
          <p>Every limit on this page is measured in deliveries, so here is exactly what puts one on the meter.</p>

          <figure className={styles.meter} aria-hidden="true">
            <figcaption>Example month on Growth</figcaption>
            <p className={styles.meterTotal}>
              <strong>25,000</strong>
              <span>of 25,000 deliveries</span>
            </p>
            <div className={styles.meterBar}>
              {meterSegments.map((segment) => (
                <span key={segment.kind} data-kind={segment.kind} style={{ "--share": segment.share } as CSSProperties} />
              ))}
            </div>
            <ul className={styles.meterLegend}>
              {meterSegments.map((segment) => (
                <li key={segment.kind} data-kind={segment.kind}>
                  {segment.label}
                  <span>{segment.value}</span>
                </li>
              ))}
            </ul>
          </figure>
        </div>
        <dl className={styles.deliveriesList}>
          {deliveryFacts.map((fact) => (
            <div key={fact.term}>
              <dt>{fact.term}</dt>
              <dd>{fact.detail}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}

function PaymentsStrip({ interval }: { interval: BillingInterval }) {
  const growth = BILLING_PLANS.growth;
  const price = formatRupees(interval === "ANNUAL" ? growth.annualPaise : growth.monthlyPaise);

  return (
    <section className={styles.payments} aria-labelledby="payments-title">
      <Reveal className={styles.paymentsGrid}>
        {/* An invoice rather than a row of claims: GST and the payment marks
            are more convincing shown on the document they appear on. */}
        <figure className={styles.invoice} aria-hidden="true">
          <figcaption className={styles.invoiceHead}>
            <span className={styles.invoiceBrand}>Linkar</span>
            <span className={styles.invoiceKind}>Tax invoice</span>
          </figcaption>

          <dl className={styles.invoiceLines}>
            <div>
              <dt>
                {growth.name} plan
                <span>{interval === "ANNUAL" ? "Billed yearly" : "Billed monthly"}</span>
              </dt>
              <dd>{price}</dd>
            </div>
            <div>
              <dt>Applicable GST</dt>
              <dd><span className={styles.invoiceTag}>Included</span></dd>
            </div>
          </dl>

          <p className={styles.invoiceTotal}>
            <span>Total due today</span>
            <strong>{price}</strong>
          </p>

          <div className={styles.invoicePaid}>
            <span className={styles.invoicePaidLabel}>Paid with</span>
            <ul>
              {paymentMarks.map((brand) => (
                <li key={brand.name}>
                  <Image src={brand.src} alt={brand.name} width={brand.width} height={brand.height} unoptimized />
                </li>
              ))}
            </ul>
          </div>
        </figure>

        <div className={styles.paymentsCopy}>
          <p className={styles.sectionEyebrow}>Checkout</p>
          <h2 id="payments-title">No surprises on the invoice</h2>
          <dl className={styles.paymentsFacts}>
            {paymentFacts.map((fact) => (
              <div key={fact.term}>
                <dt>{fact.term}</dt>
                <dd>{fact.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>
    </section>
  );
}

function PricingFaq() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className={styles.faq} aria-labelledby="pricing-faq-title">
      <Reveal className={styles.faqGrid}>
        <div className={styles.faqLead}>
          <p className={styles.sectionEyebrow}>Billing questions</p>
          <h2 id="pricing-faq-title">Before you pay for anything</h2>
        </div>
        <div className={styles.faqList}>
          {pricingFaq.map((item) => {
            const isOpen = openId === item.id;
            const panelId = `pricing-faq-panel-${item.id}`;
            const triggerId = `pricing-faq-trigger-${item.id}`;
            return (
              <div className={styles.faqItem} key={item.id} data-open={isOpen || undefined}>
                <h3>
                  <button
                    className={styles.faqTrigger}
                    type="button"
                    id={triggerId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                  >
                    <span>{item.question}</span>
                    <span className={styles.faqMark} aria-hidden="true" />
                  </button>
                </h3>
                <div className={styles.faqPanel} id={panelId} role="region" aria-labelledby={triggerId} data-open={isOpen || undefined}>
                  <div className={styles.faqPanelInner}>
                    <p>{item.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}

function PricingCta() {
  return (
    <Reveal as="section" className={styles.cta} aria-labelledby="pricing-cta-title">
      <h2 id="pricing-cta-title">Start on Free. Move up when the DMs do.</h2>
      <p>A thousand deliveries a month, no card, and the same automation builder every plan gets.</p>
      <div className={styles.ctaActions}>
        <Link className={styles.ctaPrimary} href="/signup" prefetch={false}>
          <ButtonRoll label="Start free" />
        </Link>
        <Link className={styles.ctaSecondary} href="/#how-it-works" prefetch={false}>
          See how it works
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </Reveal>
  );
}

export function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");
  const [jumpVisible, setJumpVisible] = useState(true);
  const finderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = finderRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setJumpVisible(!entry.isIntersecting),
      { rootMargin: "-20% 0px -20% 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const comparisonRows = [
    { label: "Monthly deliveries", values: plans.map((plan) => plan.monthlyDeliveryLimit.toLocaleString("en-IN")) },
    { label: "Automations", values: plans.map((plan) => formatLimit(plan.automationLimit)) },
    {
      label: "Instagram accounts",
      icon: <InstagramGlyph size={15} brand />,
      values: plans.map((plan) => formatLimit(plan.instagramConnectionLimit)),
    },
    {
      label: "Facebook Pages",
      icon: <FacebookGlyph size={15} brand />,
      values: plans.map((plan) => formatLimit(plan.facebookConnectionLimit)),
    },
    { label: "Team seats", values: plans.map((plan) => formatLimit(plan.memberLimit)) },
    { label: "Sequences", values: plans.map((plan) => formatLimit(plan.sequenceLimit)) },
    { label: "Broadcasts per month", values: plans.map((plan) => formatLimit(plan.monthlyBroadcastLimit)) },
  ];

  return (
    <div className={`${marketingStyles.root} ${styles.root} marketing-page-root`}>
      <MarketingHeader forceSurface="solid" />
      <main id="main-content" className={`${marketingStyles.page} ${styles.page}`}>
        <section className={styles.pricing} aria-labelledby="pricing-title">
          <div className={styles.frame}>
            <header className={styles.intro}>
              <h1 id="pricing-title">Plans that grow with you.</h1>
              <p>
                <span>Start free, then add capacity when the conversations arrive.</span>{" "}
                <span>Every price includes applicable GST.</span>
              </p>
              <BillingPeriod name="public-billing-period" interval={interval} onChange={setInterval} />
            </header>

            <div className={styles.planGrid}>
              {plans.map((plan, index) => {
                const isFree = plan.key === "free";
                const isGrowth = plan.key === "growth";
                const price = interval === "ANNUAL" ? plan.annualPaise : plan.monthlyPaise;

                return (
                  <Reveal as="article" className={styles.plan} delay={index * 90} data-featured={isGrowth || undefined} aria-label={`${plan.name} plan`} key={plan.key}>
                    {isGrowth ? <p className={styles.recommendation}>Best value</p> : null}
                    <header className={styles.planHeader}>
                      <h2>{plan.name}</h2>
                      <p>{planDescriptions[plan.key]}</p>
                    </header>
                    <p className={styles.price}>
                      <strong key={interval}>{formatRupees(price)}</strong>
                      <span>/{interval === "ANNUAL" ? "year" : "month"}</span>
                    </p>
                    <p className={styles.billingNote}>
                      {isFree ? "No card required" : interval === "ANNUAL" ? "2 months free" : "Billed monthly"}
                    </p>
                    <p className={styles.deliveryLead}>
                      <strong>{plan.monthlyDeliveryLimit.toLocaleString("en-IN")} deliveries</strong>
                      <span>each month</span>
                    </p>
                    <Link className={styles.planAction} data-featured={isGrowth || undefined} href="/signup" prefetch={false}>
                      <ButtonRoll label={isFree ? "Start free" : `Choose ${plan.name}`} />
                    </Link>
                    <dl className={styles.limits}>
                      <div><dt>Automations</dt><dd>{plan.automationLimit} automations</dd></div>
                      <div>
                        <dt><InstagramGlyph size={15} brand />Instagram</dt>
                        <dd>{plan.instagramConnectionLimit} {plan.instagramConnectionLimit === 1 ? "account" : "accounts"}</dd>
                      </div>
                      <div>
                        <dt><FacebookGlyph size={15} brand />Facebook</dt>
                        <dd>{plan.facebookConnectionLimit} {plan.facebookConnectionLimit === 1 ? "Page" : "Pages"}</dd>
                      </div>
                      <div><dt>Team</dt><dd>{plan.memberLimit} {plan.memberLimit === 1 ? "seat" : "seats"}</dd></div>
                    </dl>
                    <ul className={styles.features}>
                      {plan.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}
                    </ul>
                  </Reveal>
                );
              })}
            </div>

            <div ref={finderRef}>
              <PlanFinder interval={interval} />
            </div>

            <section className={styles.comparison} aria-labelledby="comparison-title">
              <Reveal as="header" className={styles.comparisonHeader}>
                <h2 id="comparison-title">Compare plans and pricing info</h2>
                <BillingPeriod name="comparison-billing-period" interval={interval} onChange={setInterval} />
              </Reveal>
              <Reveal className={styles.comparisonScroller} tabIndex={0} aria-label="Scrollable plan comparison">
                <table>
                  <thead>
                    <tr className={styles.chooseRow}>
                      <th scope="col"><span className={styles.chooseLead}>Choose your plan</span></th>
                      {plans.map((plan) => {
                        const price = interval === "ANNUAL" ? plan.annualPaise : plan.monthlyPaise;
                        return (
                          <th scope="col" key={plan.key}>
                            <span className={styles.chooseName}>{plan.name}</span>
                            <span className={styles.choosePrice} key={interval}>
                              {plan.key === "free"
                                ? formatRupees(0)
                                : `From ${formatRupees(price)}/${interval === "ANNUAL" ? "yr" : "mo"}`}
                            </span>
                            <Link className={styles.chooseAction} href="/signup" prefetch={false}>
                              {plan.key === "free" ? "Start for free" : "Get started"}
                            </Link>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, rowIndex) => (
                      <tr key={row.label} style={{ "--row": rowIndex } as CSSProperties}>
                        <th scope="row">
                          <span className={styles.rowLabel}>{"icon" in row ? row.icon : null}{row.label}</span>
                        </th>
                        {row.values.map((value, index) => <td key={plans[index].key}>{value}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Reveal>
            </section>

            <DeliveryExplainer />
            <PaymentsStrip interval={interval} />
            <PricingFaq />
            <PricingCta />
          </div>
        </section>
      </main>

      <a className={styles.jump} href="#plan-finder" data-visible={jumpVisible || undefined}>
        Pick your plan in 30 seconds
        <span aria-hidden="true">&#8593;</span>
      </a>

      <MarketingFooter compact />
    </div>
  );
}
