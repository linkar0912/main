"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";

import type { BillingInterval, BillingPlanKey } from "@/src/lib/billing/types";
import { formatRupees, signupHref } from "./pricing-format";
import styles from "./pricing-page.module.css";

/**
 * The one piece of pricing state the whole page shares: monthly or annual.
 * The page itself is a server component; only the leaves below that print a
 * price, a billing note, or a plan-specific signup link read this context.
 */
const IntervalContext = createContext<{ interval: BillingInterval; setInterval: (next: BillingInterval) => void }>({
  interval: "MONTHLY",
  setInterval: () => undefined,
});

export function PricingIntervalProvider({ children }: { children: ReactNode }) {
  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");
  return <IntervalContext.Provider value={{ interval, setInterval }}>{children}</IntervalContext.Provider>;
}

export function usePricingInterval(): BillingInterval {
  return useContext(IntervalContext).interval;
}

type PricedPlan = { key: BillingPlanKey | "free"; monthlyPaise: number; annualPaise: number };

export function BillingPeriod({ name }: { name: string }) {
  const { interval, setInterval } = useContext(IntervalContext);
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
            onChange={() => setInterval("MONTHLY")}
          />
          Monthly
        </label>
        <label data-active={interval === "ANNUAL"}>
          <input
            type="radio"
            name={name}
            value="ANNUAL"
            checked={interval === "ANNUAL"}
            onChange={() => setInterval("ANNUAL")}
          />
          Annual
        </label>
      </div>
      <span className={styles.periodSaving} aria-hidden="true">Save 2 months</span>
    </div>
  );
}

/** The large price on a plan card. */
export function PlanPrice({ plan }: { plan: PricedPlan }) {
  const interval = usePricingInterval();
  return (
    <p className={styles.price}>
      <strong key={interval}>{formatRupees(interval === "ANNUAL" ? plan.annualPaise : plan.monthlyPaise)}</strong>
      <span>/{interval === "ANNUAL" ? "year" : "month"}</span>
    </p>
  );
}

export function PlanBillingNote({ isFree }: { isFree: boolean }) {
  const interval = usePricingInterval();
  return (
    <p className={styles.billingNote}>
      {isFree ? "No card required" : interval === "ANNUAL" ? "2 months free" : "Billed monthly"}
    </p>
  );
}

/** The compact price in the comparison table header. */
export function ComparisonPrice({ plan }: { plan: PricedPlan }) {
  const interval = usePricingInterval();
  const price = interval === "ANNUAL" ? plan.annualPaise : plan.monthlyPaise;
  return (
    <span className={styles.choosePrice} key={interval}>
      {plan.key === "free" ? formatRupees(0) : `${formatRupees(price)}/${interval === "ANNUAL" ? "yr" : "mo"}`}
    </span>
  );
}

/** Signup link carrying the plan and the billing period currently shown. */
export function PlanSignupLink({
  plan,
  className,
  featured,
  children,
}: {
  plan: BillingPlanKey | "free";
  className?: string;
  featured?: boolean;
  children: ReactNode;
}) {
  const interval = usePricingInterval();
  return (
    <Link className={className} data-featured={featured || undefined} href={signupHref(plan, interval)} prefetch={false}>
      {children}
    </Link>
  );
}

/** Text that differs between monthly and annual billing. */
export function IntervalText({ monthly, annual }: { monthly: string; annual: string }) {
  return <>{usePricingInterval() === "ANNUAL" ? annual : monthly}</>;
}

export function IntervalAmount({ plan }: { plan: PricedPlan }) {
  const interval = usePricingInterval();
  return <>{formatRupees(interval === "ANNUAL" ? plan.annualPaise : plan.monthlyPaise)}</>;
}
