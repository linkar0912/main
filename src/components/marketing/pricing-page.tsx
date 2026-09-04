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

function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");

  return (
    <div className={`${marketingStyles.root} ${styles.root} marketing-page-root`}>
      <MarketingHeader forceSurface="solid" />
      <main id="main-content" className={`${marketingStyles.page} ${styles.page}`}>
        <section className={styles.hero} aria-labelledby="pricing-title">
          <div className={styles.heroFrame}>
            <div className={styles.heroCopy}>
              <p className={styles.kicker}>Linkar pricing</p>
              <h1 id="pricing-title">Start free. Stay because it works.</h1>
              <p className={styles.lede}>Useful limits from day one, with room for your audience, team, and conversations to grow.</p>
            </div>
            <div className={styles.zeroMark} aria-label="Free plan starts at zero rupees">
              <span>Starts at</span>
              <strong>₹0</strong>
              <small>No card required</small>
            </div>
          </div>
        </section>

        <section className={styles.pricing} aria-labelledby="plan-heading">
          <div className={styles.pricingFrame}>
            <header className={styles.pricingHeader}>
              <div>
                <h2 id="plan-heading">Pick the capacity you need now.</h2>
                <p>Every price includes applicable GST.</p>
              </div>
              <fieldset className={styles.period}>
                <legend>Billing period</legend>
                <label data-active={interval === "MONTHLY"}>
                  <input type="radio" name="public-billing-period" value="MONTHLY" checked={interval === "MONTHLY"} onChange={() => setInterval("MONTHLY")} />
                  Monthly
                </label>
                <label data-active={interval === "ANNUAL"}>
                  <input type="radio" name="public-billing-period" value="ANNUAL" checked={interval === "ANNUAL"} onChange={() => setInterval("ANNUAL")} />
                  Annual
                  <span aria-hidden="true">Save 2 months</span>
                </label>
              </fieldset>
            </header>

            <div className={styles.planLedger}>
              {plans.map((plan) => {
                const isFree = plan.key === "free";
                const isGrowth = plan.key === "growth";
                const price = interval === "ANNUAL" ? plan.annualPaise : plan.monthlyPaise;
                return (
                  <article className={styles.plan} data-featured={isGrowth || undefined} aria-label={`${plan.name} plan`} key={plan.key}>
                    {isGrowth ? <p className={styles.recommendation}>Best value</p> : <div className={styles.recommendationSpacer} aria-hidden="true" />}
                    <h3>{plan.name}</h3>
                    <p className={styles.price}>
                      <strong>{formatRupees(price)}</strong>
                      <span>/{interval === "ANNUAL" ? "year" : "month"}</span>
                    </p>
                    {interval === "ANNUAL" && !isFree ? <p className={styles.saving}>2 months free</p> : <div className={styles.savingSpacer} aria-hidden="true" />}
                    <p className={styles.planNote}>{isFree ? "For trying your first live flows." : `For ${plan.name.toLowerCase()} workloads.`}</p>
                    <dl className={styles.limits}>
                      <div><dt>Monthly deliveries</dt><dd>{plan.monthlyDeliveryLimit.toLocaleString("en-IN")} deliveries</dd></div>
                      <div><dt>Automations</dt><dd>{plan.automationLimit} automations</dd></div>
                      <div><dt>Connected accounts</dt><dd>{plan.instagramConnectionLimit} + {plan.facebookConnectionLimit} Instagram + Facebook</dd></div>
                      <div><dt>Team</dt><dd>{plan.memberLimit} {plan.memberLimit === 1 ? "seat" : "seats"}</dd></div>
                    </dl>
                    <ul className={styles.features}>
                      {plan.features.map((feature) => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}
                    </ul>
                    <Link className={styles.planAction} data-featured={isGrowth || undefined} href="/signup" prefetch={false}>
                      <ButtonRoll label={isFree ? "Start free" : `Choose ${plan.name}`} />
                    </Link>
                  </article>
                );
              })}
            </div>

            <div className={styles.assurance}>
              <p><strong>Switch when your workload changes.</strong> Start on Free and upgrade when more conversations arrive.</p>
              <p><strong>One clear bill.</strong> GST is already included in every displayed price.</p>
              <p><strong>Keep your work.</strong> Your automations remain in your workspace when you change plans.</p>
            </div>
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="pricing-cta-title">
          <div>
            <h2 id="pricing-cta-title">Your first 1,000 deliveries are on us.</h2>
            <p>Create the workspace, connect your account, and publish when you are ready.</p>
          </div>
          <Link className={styles.finalAction} href="/signup" prefetch={false}><ButtonRoll label="Start free" /></Link>
        </section>
      </main>
      <MarketingFooter compact />
    </div>
  );
}
