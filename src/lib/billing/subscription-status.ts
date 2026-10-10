import { BillingSubscriptionStatus } from "@prisma/client";

/** Razorpay never sends further lifecycle events for these; a new checkout may replace them. */
const TERMINAL_STATUSES = new Set<BillingSubscriptionStatus>([
  BillingSubscriptionStatus.CANCELLED,
  BillingSubscriptionStatus.COMPLETED,
  BillingSubscriptionStatus.EXPIRED,
]);

/** Statuses that keep (or are about to start) paid access without a paid-through window. */
export const PAID_ACCESS_STATUSES: readonly BillingSubscriptionStatus[] = [
  BillingSubscriptionStatus.ACTIVE,
  BillingSubscriptionStatus.AUTHENTICATED,
];

/** Statuses that keep the paid plan only until currentPeriodEnd. */
export const LAPSED_STATUSES = new Set<BillingSubscriptionStatus>([
  BillingSubscriptionStatus.PENDING,
  BillingSubscriptionStatus.HALTED,
  BillingSubscriptionStatus.PAUSED,
  BillingSubscriptionStatus.CANCELLED,
  BillingSubscriptionStatus.COMPLETED,
  BillingSubscriptionStatus.EXPIRED,
]);

export function isLiveSubscriptionStatus(status: BillingSubscriptionStatus): boolean {
  return !TERMINAL_STATUSES.has(status);
}

// Razorpay's lifecycle order: created → authenticated → active (activated, then
// charged — usually in the same second) → pending → halted (retries exhausted)
// → cancelled → completed/expired. Paused sits with the degraded states it is
// entered from. Only used to order events that share a created_at second.
const STATUS_PRECEDENCE: Record<BillingSubscriptionStatus, number> = {
  CREATED: 0,
  AUTHENTICATED: 1,
  ACTIVE: 2,
  PENDING: 3,
  HALTED: 4,
  PAUSED: 4,
  CANCELLED: 5,
  COMPLETED: 6,
  EXPIRED: 6,
};

export function subscriptionStatusPrecedence(status: BillingSubscriptionStatus): number {
  return STATUS_PRECEDENCE[status];
}
