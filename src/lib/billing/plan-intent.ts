import { BILLING_PLANS } from "./catalog";
import type { BillingInterval, BillingPlanKey } from "./types";
import type { OnboardingSummary } from "@/src/lib/onboarding/status";

/**
 * The paid plan a visitor picked on /pricing, carried through sign-up (or
 * sign-in) and first-time onboarding to that plan's checkout in Billing.
 *
 * It only ever selects which existing plan and billing period Billing opens:
 * the price always comes from the server-side catalog at checkout, so an
 * intent is validated against BILLING_PLANS and nothing else in it is used.
 */
export type PlanIntent = { plan: BillingPlanKey; interval: BillingInterval };

export const PLAN_INTENT_COOKIE = "linkar_plan_intent";
/** An intent left unused for a day is dropped; the cookie expires with it. */
export const PLAN_INTENT_TTL_SECONDS = 24 * 60 * 60;

const INTERVALS: Record<string, BillingInterval> = { monthly: "MONTHLY", annual: "ANNUAL" };

function isPlanKey(value: unknown): value is BillingPlanKey {
  return typeof value === "string" && Object.hasOwn(BILLING_PLANS, value);
}

/**
 * `?plan=growth&interval=annual` from the pricing links. Free and unknown
 * plans are not an intent; a missing period means monthly, an unknown one is
 * rejected rather than guessed.
 */
export function parsePlanIntent(plan: unknown, interval: unknown): PlanIntent | null {
  if (!isPlanKey(plan)) return null;
  if (interval === undefined || interval === null || interval === "") return { plan, interval: "MONTHLY" };
  if (typeof interval !== "string") return null;
  const parsed = Object.hasOwn(INTERVALS, interval.toLowerCase()) ? INTERVALS[interval.toLowerCase()] : undefined;
  return parsed ? { plan, interval: parsed } : null;
}

/** "Growth plan, billed monthly" - how the auth pages name the pick back to the visitor. */
export function describePlanIntent(intent: PlanIntent): string {
  return `${BILLING_PLANS[intent.plan].name} plan, billed ${intent.interval === "ANNUAL" ? "yearly" : "monthly"}`;
}

/** "growth.annual.1760000000": plan, period and when it was picked (seconds). */
export function serializePlanIntent(intent: PlanIntent, now = Date.now()): string {
  return `${intent.plan}.${intent.interval.toLowerCase()}.${Math.floor(now / 1_000)}`;
}

/**
 * Reads the cookie value back. Expiry is checked here too, not only by the
 * browser, so a cookie whose lifetime was stretched still lapses after 24h.
 */
export function readPlanIntent(value: string | null | undefined, now = Date.now()): PlanIntent | null {
  if (!value || value.length > 64) return null;
  const match = /^([a-z]+)\.([a-z]+)\.(\d{1,12})$/.exec(value);
  if (!match) return null;
  const issuedAt = Number(match[3]) * 1_000;
  const age = now - issuedAt;
  // A little clock skew between app instances is fine; the future is not.
  if (age > PLAN_INTENT_TTL_SECONDS * 1_000 || age < -5 * 60 * 1_000) return null;
  return parsePlanIntent(match[1], match[2]);
}

/** Query string that pre-selects the plan in Billing: "plan=growth&interval=annual". */
export function planIntentQuery(intent: PlanIntent): string {
  return new URLSearchParams({ plan: intent.plan, interval: intent.interval.toLowerCase() }).toString();
}

/** Adds `plan` and `interval` to a URL (an email confirmation link) when there is an intent. */
export function withPlanIntentParams(url: URL, intent: PlanIntent | null): URL {
  if (!intent) return url;
  url.searchParams.set("plan", intent.plan);
  url.searchParams.set("interval", intent.interval.toLowerCase());
  return url;
}

/** Settings → Billing with the plan pre-selected, where its checkout opens. */
export function planIntentBillingPath(intent: PlanIntent): string {
  return `/settings?section=billing&${planIntentQuery(intent)}`;
}

export function samePlanIntent(a: PlanIntent | null | undefined, b: PlanIntent | null | undefined): boolean {
  return Boolean(a && b && a.plan === b.plan && a.interval === b.interval);
}

/**
 * Where someone lands after signing in by default (`next` falls back to these).
 * Only these hand over to Billing, so a deep link or a page picked at the end
 * of onboarding is never pulled out from under the person.
 */
const LANDING_PATHS = new Set(["/dashboard", "/automations"]);

/**
 * The app shell's decision for a signed-in person with a plan intent: once
 * onboarding is out of the way (it always comes first), a default landing
 * page hands over to Billing. Returns the path to go to, or null to stay.
 */
export function planIntentRedirectPath(
  intent: PlanIntent | null | undefined,
  onboarding: OnboardingSummary | null | undefined,
  pathname: string,
): string | null {
  if (!intent) return null;
  // Unknown onboarding state (a failed read) never redirects anywhere.
  if (!onboarding || onboarding.required) return null;
  if (!LANDING_PATHS.has(pathname)) return null;
  return planIntentBillingPath(intent);
}

/** Leaving onboarding for Home goes to the chosen plan's checkout instead. */
export function onboardingExitPath(href: string, intent: PlanIntent | null | undefined): string {
  return intent && href === "/dashboard" ? planIntentBillingPath(intent) : href;
}

type BillingState = {
  canManage: boolean;
  billingConfigured: boolean;
  entitlementPlanKey: string;
  subscription: unknown;
};

/**
 * What Billing does with an intent once its view has loaded: open the
 * checkout, or just show the normal view (the workspace already has that plan
 * or a subscription, the person cannot manage billing, or checkout is not set
 * up). Either way the intent is used up.
 */
export function planIntentCheckoutAction(view: BillingState, intent: PlanIntent): "checkout" | "show" {
  if (!view.canManage || !view.billingConfigured) return "show";
  if (view.subscription) return "show";
  if (view.entitlementPlanKey === intent.plan) return "show";
  return "checkout";
}
