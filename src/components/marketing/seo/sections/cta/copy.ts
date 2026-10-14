import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import type { FinalCtaTone } from "../../seo-theme";

export type CtaTone = FinalCtaTone;

const count = (value: number) => value.toLocaleString("en-IN");
const rupees = (paise: number) => `₹${count(paise / 100)}`;

export const ctaEyebrow = "Your next reply starts here";
/** "once." is set as a sticker in every variant, so the lead and the mark are kept apart. */
export const ctaHeadlineLead = "Write it";
export const ctaHeadlineMark = "once.";
export const ctaHeadline = [`${ctaHeadlineLead} ${ctaHeadlineMark}`, "Keep the conversation moving."] as const;
export const ctaSub = `Start free with ${FREE_BILLING_PLAN.automationLimit} automations and ${count(FREE_BILLING_PLAN.monthlyDeliveryLimit)} messages a month. Choose an interaction, write the answer, and test your first workflow.`;
export const ctaPrimary = { href: "/signup", label: "Create your first reply" } as const;
export const ctaSecondary = { href: "/pricing", label: "See plans" } as const;
/** A one-line plan summary for compact CTAs. */
export const ctaPlanLine = `Free: ${FREE_BILLING_PLAN.automationLimit} automations, ${count(FREE_BILLING_PLAN.monthlyDeliveryLimit)} messages a month. ${BILLING_PLANS.creator.name}: ${rupees(BILLING_PLANS.creator.monthlyPaise)} a month.`;

export type PlanFacts = { key: string; name: string; tag: string; price: string; checks: readonly string[]; extras: readonly string[] };

/** Plan facts come straight from the billing catalog, so the CTA never drifts from pricing. */
export const ctaPlans: readonly PlanFacts[] = [
  {
    key: FREE_BILLING_PLAN.key,
    name: FREE_BILLING_PLAN.name,
    tag: "Start here",
    price: rupees(FREE_BILLING_PLAN.monthlyPaise),
    checks: [
      `${FREE_BILLING_PLAN.automationLimit} automations`,
      `${count(FREE_BILLING_PLAN.monthlyDeliveryLimit)} messages a month`,
      "Instagram and Facebook Page replies",
    ],
    extras: [],
  },
  {
    key: BILLING_PLANS.creator.key,
    name: BILLING_PLANS.creator.name,
    tag: "Paid plan",
    price: rupees(BILLING_PLANS.creator.monthlyPaise),
    checks: [
      `${BILLING_PLANS.creator.automationLimit} automations`,
      `${count(BILLING_PLANS.creator.monthlyDeliveryLimit)} messages a month`,
    ],
    extras: BILLING_PLANS.creator.features,
  },
];
