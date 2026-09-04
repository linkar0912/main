"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useState } from "react";

import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import type { BillingInterval } from "@/src/lib/billing/types";
import { ButtonRoll } from "./button-roll";
import { MarketingFooter } from "./marketing-footer";
import { MarketingHeader } from "./marketing-header";
import marketingStyles from "./marketing-page.module.css";
import styles from "./pricing-page.module.css";

const plans = [FREE_BILLING_PLAN, ...Object.values(BILLING_PLANS)];

const planDescriptions: Record<(typeof plans)[number]["key"], string> = {
  free: "Explore the core workflow for free.",
  creator: "For solo creators building momentum.",
  growth: "For growing creators and small teams.",
  agency: "For teams running high-volume campaigns.",
};

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

export function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");

  const comparisonRows = [
    { label: "Monthly deliveries", values: plans.map((plan) => plan.monthlyDeliveryLimit.toLocaleString("en-IN")) },
    { label: "Automations", values: plans.map((plan) => formatLimit(plan.automationLimit)) },
    { label: "Instagram accounts", values: plans.map((plan) => formatLimit(plan.instagramConnectionLimit)) },
    { label: "Facebook Pages", values: plans.map((plan) => formatLimit(plan.facebookConnectionLimit)) },
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
              <fieldset className={styles.period}>
                <legend>Billing period</legend>
                <label data-active={interval === "MONTHLY"}>
                  <input
                    type="radio"
                    name="public-billing-period"
                    value="MONTHLY"
                    checked={interval === "MONTHLY"}
                    onChange={() => setInterval("MONTHLY")}
                  />
                  Monthly
                </label>
                <label data-active={interval === "ANNUAL"}>
                  <input
                    type="radio"
                    name="public-billing-period"
                    value="ANNUAL"
                    checked={interval === "ANNUAL"}
                    onChange={() => setInterval("ANNUAL")}
                  />
                  Annual
                </label>
                <span className={styles.periodSaving} aria-hidden="true">Save 2 months</span>
              </fieldset>
            </header>

            <div className={styles.planGrid}>
              {plans.map((plan) => {
                const isFree = plan.key === "free";
                const isGrowth = plan.key === "growth";
                const price = interval === "ANNUAL" ? plan.annualPaise : plan.monthlyPaise;

                return (
                  <article className={styles.plan} data-featured={isGrowth || undefined} aria-label={`${plan.name} plan`} key={plan.key}>
                    {isGrowth ? <p className={styles.recommendation}>Best value</p> : null}
                    <header className={styles.planHeader}>
                      <h2>{plan.name}</h2>
                      <p>{planDescriptions[plan.key]}</p>
                    </header>
                    <p className={styles.price}>
                      <strong>{formatRupees(price)}</strong>
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
                      <div><dt>Instagram + Facebook</dt><dd>{plan.instagramConnectionLimit} + {plan.facebookConnectionLimit} Instagram + Facebook</dd></div>
                      <div><dt>Team</dt><dd>{plan.memberLimit} {plan.memberLimit === 1 ? "seat" : "seats"}</dd></div>
                    </dl>
                    <ul className={styles.features}>
                      {plan.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}
                    </ul>
                  </article>
                );
              })}
            </div>

            <section className={styles.comparison} aria-labelledby="comparison-title">
              <header className={styles.comparisonHeader}>
                <h2 id="comparison-title">Compare every plan</h2>
                <p>The limits that matter, side by side.</p>
              </header>
              <div className={styles.comparisonScroller} tabIndex={0} aria-label="Scrollable plan comparison">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Capacity</th>
                      {plans.map((plan) => <th scope="col" key={plan.key}>{plan.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        {row.values.map((value, index) => <td key={plans[index].key}>{value}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </main>
      <MarketingFooter compact />
    </div>
  );
}
