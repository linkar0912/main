import type { BillingInterval, BillingPlanKey } from "@/src/lib/billing/types";

export function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function formatLimit(value: number): string {
  return value === 0 ? "Not included" : value.toLocaleString("en-IN");
}

/**
 * Signup link that carries the plan the visitor picked, so signup can send
 * them on to that plan's checkout. Free needs no plan, so it stays bare.
 */
export function signupHref(plan: BillingPlanKey | "free", interval: BillingInterval): string {
  if (plan === "free") return "/signup";
  const params = new URLSearchParams({ plan, interval: interval.toLowerCase() });
  return `/signup?${params.toString()}`;
}
