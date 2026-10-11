import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import type { CSSProperties } from "react";

import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import { FacebookGlyph } from "../facebook-glyph";
import { InstagramGlyph } from "../instagram-glyph";
import { ButtonRoll } from "./button-roll";
import { MarketingFooter } from "./marketing-footer";
import { MarketingHeader } from "./marketing-header";
import { formatLimit } from "./pricing-format";
import { PricingFaq } from "./pricing-faq";
import { PlanFinder } from "./pricing-finder";
import {
  BillingPeriod,
  ComparisonPrice,
  IntervalAmount,
  IntervalText,
  PlanBillingNote,
  PlanPrice,
  PlanSignupLink,
  PricingIntervalProvider,
} from "./pricing-interval";
import { PricingJump } from "./pricing-jump";
import { Reveal } from "./reveal";
import marketingStyles from "./marketing-page.module.css";
import styles from "./pricing-page.module.css";

/*
 * Server component. The static bulk of the page - plan limits, the comparison
 * table, the delivery explainer, the invoice - renders on the server; the
 * client islands are the billing-period toggle and the leaves that read it
 * (pricing-interval.tsx), the plan finder, the FAQ accordion, and the jump
 * link.
 */

const plans = [FREE_BILLING_PLAN, ...Object.values(BILLING_PLANS)];

/** Only what the client price leaves need, so the full plan object stays server-side. */
function priced(plan: (typeof plans)[number]) {
  return { key: plan.key, monthlyPaise: plan.monthlyPaise, annualPaise: plan.annualPaise };
}

const planDescriptions: Record<(typeof plans)[number]["key"], string> = {
  free: "Explore the core workflow for free.",
  creator: "For solo creators building momentum.",
  growth: "For growing creators and small teams.",
  agency: "For teams running high-volume campaigns.",
};

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
] as const;

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

function PaymentsStrip() {
  const growth = BILLING_PLANS.growth;

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
                <span><IntervalText monthly="Billed monthly" annual="Billed yearly" /></span>
              </dt>
              <dd><IntervalAmount plan={priced(growth)} /></dd>
            </div>
            <div>
              <dt>Applicable GST</dt>
              <dd><span className={styles.invoiceTag}>Included</span></dd>
            </div>
          </dl>

          <p className={styles.invoiceTotal}>
            <span>Total due today</span>
            <strong><IntervalAmount plan={priced(growth)} /></strong>
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

function PricingCta() {
  return (
    <Reveal as="section" className={styles.cta} aria-labelledby="pricing-cta-title" data-jump-stop="">
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

const comparisonRows = [
  { label: "Monthly deliveries", values: plans.map((plan) => plan.monthlyDeliveryLimit.toLocaleString("en-IN")) },
  { label: "Automations", values: plans.map((plan) => formatLimit(plan.automationLimit)) },
  { label: "Instagram accounts", channel: "instagram", values: plans.map((plan) => formatLimit(plan.instagramConnectionLimit)) },
  { label: "Facebook Pages", channel: "facebook", values: plans.map((plan) => formatLimit(plan.facebookConnectionLimit)) },
  { label: "Team seats", values: plans.map((plan) => formatLimit(plan.memberLimit)) },
  { label: "Sequences", values: plans.map((plan) => formatLimit(plan.sequenceLimit)) },
  { label: "Broadcasts per month", values: plans.map((plan) => formatLimit(plan.monthlyBroadcastLimit)) },
] as const;

export function PricingPage() {
  return (
    <div className={`${marketingStyles.root} ${styles.root} marketing-page-root`}>
      <MarketingHeader forceSurface="solid" />
      <main id="main-content" className={`${marketingStyles.page} ${styles.page}`}>
        <PricingIntervalProvider>
          <section className={styles.pricing} aria-labelledby="pricing-title">
            <div className={styles.frame}>
              <header className={styles.intro}>
                <h1 id="pricing-title">Plans that grow with you.</h1>
                <p>
                  <span>Start free, then add capacity when the conversations arrive.</span>{" "}
                  <span>Every price includes applicable GST.</span>
                </p>
                <BillingPeriod name="public-billing-period" />
              </header>

              <div className={styles.planGrid}>
                {plans.map((plan, index) => {
                  const isFree = plan.key === "free";
                  const isGrowth = plan.key === "growth";

                  return (
                    <Reveal as="article" className={styles.plan} delay={index * 90} data-featured={isGrowth || undefined} aria-label={`${plan.name} plan`} key={plan.key}>
                      {isGrowth ? <p className={styles.recommendation}>Best value</p> : null}
                      <header className={styles.planHeader}>
                        <h2>{plan.name}</h2>
                        <p>{planDescriptions[plan.key]}</p>
                      </header>
                      <PlanPrice plan={priced(plan)} />
                      <PlanBillingNote isFree={isFree} />
                      <p className={styles.deliveryLead}>
                        <strong>{plan.monthlyDeliveryLimit.toLocaleString("en-IN")} deliveries</strong>
                        <span>each month</span>
                      </p>
                      <PlanSignupLink plan={plan.key} className={styles.planAction} featured={isGrowth}>
                        <ButtonRoll label={isFree ? "Start free" : `Choose ${plan.name}`} />
                      </PlanSignupLink>
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

              <PlanFinder />

              <section className={styles.comparison} aria-labelledby="comparison-title">
                <Reveal as="header" className={styles.comparisonHeader}>
                  <h2 id="comparison-title">Compare plans and pricing info</h2>
                  <BillingPeriod name="comparison-billing-period" />
                </Reveal>
                <Reveal className={styles.comparisonScroller} tabIndex={0} aria-label="Scrollable plan comparison">
                  <table>
                    <thead>
                      <tr className={styles.chooseRow}>
                        <th scope="col"><span className={styles.chooseLead}>Choose your plan</span></th>
                        {plans.map((plan) => (
                          <th scope="col" key={plan.key}>
                            <span className={styles.chooseName}>{plan.name}</span>
                            <ComparisonPrice plan={priced(plan)} />
                            <PlanSignupLink plan={plan.key} className={styles.chooseAction}>
                              {plan.key === "free" ? "Start for free" : "Get started"}
                            </PlanSignupLink>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map((row, rowIndex) => (
                        <tr key={row.label} style={{ "--row": rowIndex } as CSSProperties}>
                          <th scope="row">
                            <span className={styles.rowLabel}>
                              {"channel" in row && row.channel === "instagram" ? <InstagramGlyph size={15} brand /> : null}
                              {"channel" in row && row.channel === "facebook" ? <FacebookGlyph size={15} brand /> : null}
                              {row.label}
                            </span>
                          </th>
                          {row.values.map((value, index) => <td key={plans[index].key}>{value}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Reveal>
              </section>

              <DeliveryExplainer />
              <PaymentsStrip />
              <PricingFaq items={pricingFaq} />
              <PricingCta />
            </div>
          </section>
        </PricingIntervalProvider>
      </main>

      <PricingJump targetId="plan-finder" />

      <MarketingFooter compact />
    </div>
  );
}
