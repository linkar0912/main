"use client";

import { Check, CreditCard, Gauge, Sparkles, TicketCheck } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";

import { openRazorpaySubscriptionCheckout } from "@/src/lib/client/razorpay-checkout";
import { getBillingView, invalidateWorkspaceResource, notifyWorkspaceChanged, type BillingView } from "@/src/lib/client/workspace-data";
import { FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import type { BillingInterval, BillingPlanKey } from "@/src/lib/billing/types";
import { ActionNotice } from "./action-notice";
import { InlineConfirm } from "./inline-confirm";
import { InlineContentSkeleton } from "./skeleton";
import { StatusBadge, type StatusTone } from "./ui/status-badge";

const ACTIVATION_POLL_MS = 3_000;
const ACTIVATION_TIMEOUT_MS = 45_000;

function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function intervalLabel(value: string | undefined): string {
  return value === "ANNUAL" ? "annual" : "monthly";
}

function planNameFor(view: BillingView, planId: string | undefined): string {
  const key = planId?.replace(/^plan_/, "");
  return [FREE_BILLING_PLAN, ...view.catalog].find((plan) => plan.key === key)?.name ?? "your current plan";
}

/** Razorpay subscription states in plain words, with the status tone they deserve. */
const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  AUTHENTICATED: { label: "Starting", tone: "neutral" },
  CREATED: { label: "Not started", tone: "neutral" },
  PENDING: { label: "Payment pending", tone: "warning" },
  HALTED: { label: "Payment failed", tone: "danger" },
  PAUSED: { label: "Paused", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  COMPLETED: { label: "Ended", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

function subscriptionStatus(status: string): { label: string; tone: StatusTone } {
  return SUBSCRIPTION_STATUS[status] ?? { label: status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " "), tone: "neutral" };
}

function billingErrorMessage(code: string): string {
  return code === "provider_unavailable"
    ? "Razorpay is temporarily unavailable. No plan change was made."
    : "Billing could not be updated. Check your connection and try again.";
}

/** A plan switch waiting for the owner to confirm it, with the words they confirm. */
type PendingPlanChange = { plan: BillingPlanKey; interval: BillingInterval; nextName: string; effective: string; message: string };

const SUBSCRIPTION_EXISTS_MESSAGE = "This workspace already has a subscription, so no new checkout was started. Refresh in a moment to manage it here.";

export function BillingSettings() {
  const [view, setView] = useState<BillingView | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");
  const [busyPlan, setBusyPlan] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activating, setActivating] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [redeemingInvite, setRedeemingInvite] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  // Switching plans and cancelling are confirmed in place, next to the button.
  const [pendingChange, setPendingChange] = useState<PendingPlanChange | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const load = useCallback(async (fresh = false) => {
    if (fresh) invalidateWorkspaceResource("billing");
    const next = await getBillingView();
    setView(next);
    return next;
  }, []);

  // A plan change also changes the sidebar plan and limits shown elsewhere.
  const refreshAfterChange = useCallback(() => {
    notifyWorkspaceChanged();
    return load(true);
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void getBillingView(controller.signal)
      .then(setView)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("Billing details could not be loaded. Try again.");
      });
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    if (!activating) return;
    const pollTimer = window.setInterval(() => {
      void load(true).then((next) => {
        if (next.subscription?.status === "ACTIVE") {
          setActivating(false);
          setMessage("Your plan is active.");
          notifyWorkspaceChanged();
        }
      }).catch(() => undefined);
    }, ACTIVATION_POLL_MS);
    const timeoutTimer = window.setTimeout(() => {
      setActivating(false);
      setMessage("Checkout was verified. Razorpay is still confirming your plan. Refresh in a moment, and do not pay again.");
    }, ACTIVATION_TIMEOUT_MS);
    return () => {
      window.clearInterval(pollTimer);
      window.clearTimeout(timeoutTimer);
    };
  }, [activating, load]);

  useEffect(() => {
    if (!inviteNotice) return;
    const timer = window.setTimeout(() => setInviteNotice(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [inviteNotice]);

  // Razorpay applies plan changes at the end of the current cycle
  // (schedule_change_at: cycle_end): nothing is prorated or charged today.
  // Asking first: the confirmation appears in the plan card, and nothing is
  // sent until the owner confirms it there.
  function requestPlanChange(current: BillingView, plan: BillingPlanKey): void {
    const subscription = current.subscription;
    if (!subscription) return;
    const currentName = planNameFor(current, subscription.planId);
    const nextName = planNameFor(current, `plan_${plan}`);
    const effective = subscription.currentPeriodEnd
      ? `on ${formatDate(subscription.currentPeriodEnd)}, when your current billing cycle ends`
      : "when your current billing cycle ends";
    setConfirmingCancel(false);
    setPendingChange({
      plan,
      interval,
      nextName,
      effective,
      message: `Switch from ${currentName} (${intervalLabel(subscription.interval)}) to ${nextName} (${intervalLabel(interval)})? `
        + `The change takes effect ${effective}. You keep ${currentName} until then. Nothing is charged today; the new price applies from that date.`,
    });
  }

  async function confirmPlanChange(): Promise<void> {
    if (!pendingChange || busyPlan) return;
    const { plan, interval: nextInterval, nextName, effective } = pendingChange;
    setBusyPlan(plan);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/billing/change-plan", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, interval: nextInterval }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "plan_change_failed");
      setPendingChange(null);
      setMessage(`Plan change scheduled. ${nextName} starts ${effective}.`);
      await refreshAfterChange().catch(() => undefined);
    } catch (reason) {
      setError(billingErrorMessage(reason instanceof Error ? reason.message : "billing_failed"));
    } finally {
      setBusyPlan("");
    }
  }

  async function choosePlan(plan: BillingPlanKey) {
    if (!view?.canManage || busyPlan) return;
    setBusyPlan(plan);
    setError("");
    setMessage("");
    try {
      if (view.subscription?.status === "ACTIVE") {
        requestPlanChange(view, plan);
        return;
      }
      const response = await fetch("/api/billing/checkout", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, interval }),
      });
      const checkout = await response.json() as { status?: string; keyId?: string; subscriptionId?: string; error?: string };
      if (checkout.error === "subscription_exists") {
        // The cached view was stale: the workspace already pays, so switch
        // plans on that subscription rather than opening a second checkout.
        const latest = await refreshAfterChange();
        if (latest.subscription?.status === "ACTIVE") requestPlanChange(latest, plan);
        else setError(SUBSCRIPTION_EXISTS_MESSAGE);
        return;
      }
      if (!response.ok) throw new Error(checkout.error ?? "checkout_failed");
      if (checkout.status === "processing") {
        setMessage("Preparing secure checkout. Try again in a moment.");
        return;
      }
      if (!checkout.keyId || !checkout.subscriptionId) throw new Error("checkout_failed");
      const outcome = await openRazorpaySubscriptionCheckout({ key: checkout.keyId, subscriptionId: checkout.subscriptionId });
      if ("dismissed" in outcome) return;
      const verification = await fetch("/api/billing/checkout/verify", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(outcome),
      });
      if (!verification.ok) throw new Error("verification_failed");
      notifyWorkspaceChanged();
      setActivating(true);
      setMessage("Payment received. We’re activating your plan now.");
    } catch (reason) {
      setError(billingErrorMessage(reason instanceof Error ? reason.message : "billing_failed"));
    } finally {
      setBusyPlan("");
    }
  }

  async function cancelSubscription() {
    if (!view?.canManage || cancelling) return;
    setError("");
    setCancelling(true);
    try {
      const response = await fetch("/api/billing/cancel", { method: "POST" });
      if (!response.ok) {
        setError("Cancellation could not be scheduled. Try again.");
        return;
      }
      setConfirmingCancel(false);
      setMessage("Cancellation scheduled. Paid access stays active through the current billing period.");
      await refreshAfterChange().catch(() => undefined);
    } catch {
      setError("Cancellation could not be scheduled. Try again.");
    } finally {
      setCancelling(false);
    }
  }

  async function redeemInvite() {
    if (!view?.canManage || !inviteCode.trim() || redeemingInvite) return;
    setRedeemingInvite(true);
    setInviteNotice(null);
    try {
      const response = await fetch("/api/billing/invite-code", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: inviteCode }),
      });
      const payload = await response.json() as { data?: { plan: { key: string; name: string }; expiresAt: string }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "invite_code_redemption_failed");
      if (!payload.data) throw new Error("invite_code_redemption_failed");
      setInviteCode("");
      // The invite is already applied; a failed refresh must not report failure.
      await refreshAfterChange().catch(() => undefined);
      setInviteNotice({
        tone: "success",
        message: `Invite applied. ${payload.data.plan.name} access is active until ${formatDate(payload.data.expiresAt)}. Your paid subscription was not changed.`,
      });
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "invite_code_redemption_failed";
      const message = code === "invite_code_used" ? "This invite has already been used"
        : code === "premium_access_already_active" ? "This workspace already has invite access"
          : code === "invite_code_expired" || code === "invite_code_revoked" ? "This invite is no longer active"
            : code === "invite_code_invalid" ? "We couldn’t find that invite. Check the code and try again"
              : "We couldn’t apply the invite. Try again.";
      setInviteNotice({ tone: "error", message });
    } finally {
      setRedeemingInvite(false);
    }
  }

  if (!view && !error) return <section className="billing-shell" aria-label="Billing"><InlineContentSkeleton label="Loading billing" rows={4} /></section>;
  if (!view) {
    return (
      <section className="billing-shell" aria-label="Billing">
        <div className="notice-banner notice-warning billing-load-error" role="alert">
          <p>{error}</p>
          <button className="button button-secondary button-small" type="button" onClick={() => { setError(""); setLoadAttempt((attempt) => attempt + 1); }}>Try again</button>
        </div>
      </section>
    );
  }

  const plans = [FREE_BILLING_PLAN, ...view.catalog];
  const currentPlan = plans.find((plan) => plan.key === view.entitlementPlanKey) ?? FREE_BILLING_PLAN;
  const usageMaximum = currentPlan.monthlyDeliveryLimit;
  const usageValue = Math.min(view.deliveriesUsed, usageMaximum);
  return (
    <section className="billing-shell" aria-labelledby="billing-title">
      {inviteNotice ? <ActionNotice tone={inviteNotice.tone} message={inviteNotice.message} onDismiss={() => setInviteNotice(null)} /> : null}
      <header className="billing-heading">
        <div>
          <h2 id="billing-title">Plan and usage</h2>
          <p className="muted">Choose the capacity that fits your conversations. GST is included.</p>
        </div>
        <fieldset className="segmented billing-period" aria-label="Billing period">
          <legend>Billing period</legend>
          <label className="segmented-option"><input type="radio" name="billing-period" value="MONTHLY" checked={interval === "MONTHLY"} onChange={() => { setInterval("MONTHLY"); setPendingChange(null); }} /> Monthly</label>
          <label className="segmented-option"><input type="radio" name="billing-period" value="ANNUAL" checked={interval === "ANNUAL"} onChange={() => { setInterval("ANNUAL"); setPendingChange(null); }} /> Annual <span className="segmented-badge">Save 2 months</span></label>
        </fieldset>
      </header>

      <section className="billing-current panel" aria-label="Current billing summary">
        <div className="billing-current-plan"><span><CreditCard size={18} /></span><div><small>Current plan</small><strong>{currentPlan.name}</strong></div></div>
        <div className="billing-usage-copy"><small>Monthly deliveries</small><strong>{view.deliveriesUsed.toLocaleString("en-IN")} <span>of {usageMaximum.toLocaleString("en-IN")}</span></strong></div>
        <div className="billing-usage-meter" role="progressbar" aria-label="Monthly delivery usage" aria-valuemin={0} aria-valuemax={usageMaximum} aria-valuenow={usageValue}><span style={{ inlineSize: `${Math.min(100, (usageValue / usageMaximum) * 100)}%` }} /></div>
        <p>{Math.max(0, usageMaximum - view.deliveriesUsed).toLocaleString("en-IN")} deliveries remaining</p>
      </section>

      {!view.canManage && <p className="notice-banner notice-warning">Only the workspace owner can change billing. You can still review plans and usage.</p>}
      {!view.billingConfigured && <p className="notice-banner notice-warning">Secure checkout is unavailable because the payment connection is incomplete. Plan changes will be enabled once the setup is finished.</p>}
      {message && <p className="notice-banner notice-success" role="status"><Check size={17} /> {message}</p>}
      {error && <p className="notice-banner notice-warning" role="alert">{error}</p>}

      <section className="billing-invite panel" aria-labelledby="premium-invite-title">
        <div className="billing-invite-copy">
          <span><TicketCheck size={18} /></span>
          <div><h3 id="premium-invite-title">Have an invite code?</h3><p>It unlocks the plan in your invite for 30 days. Your current subscription doesn’t change, and if you already pay for a higher plan, that one stays.</p></div>
        </div>
        <div className="billing-invite-form">
          <label className="sr-only" htmlFor="premium-invite-code">Premium invite code</label>
          <input id="premium-invite-code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="LINKAR-XXXX-XXXX-XXXX" autoComplete="off" />
          <button className="button button-primary billing-invite-submit" type="button" disabled={!view.canManage || !inviteCode.trim() || redeemingInvite} onClick={() => void redeemInvite()}>{redeemingInvite ? "Applying…" : "Apply invite"}</button>
        </div>
      </section>

      <div className="billing-plan-grid">
        {view.catalog.map((plan) => {
          const current = view.entitlementPlanKey === plan.key;
          const currentBillingSelection = view.subscription?.status === "ACTIVE"
            && view.subscription.planId === `plan_${plan.key}`
            && view.subscription.interval === interval;
          const price = interval === "ANNUAL" ? plan.annualPaise : plan.monthlyPaise;
          return (
            <Fragment key={plan.key}>
            <article className={`billing-plan ${current ? "is-current" : ""} ${plan.key === "growth" ? "is-featured" : ""}`} aria-label={`${plan.name} plan`}>
              <div className="billing-plan-top">
                <h3>{plan.name}</h3>
                {current ? <span className="billing-plan-current"><Sparkles size={13} /> Current</span> : plan.key === "growth" ? <span className="billing-plan-best">Best fit</span> : null}
              </div>
              <p className="billing-price"><strong>{formatRupees(price)}</strong><span>/{interval === "ANNUAL" ? "year" : "month"}</span></p>
              <p className="billing-saving">{interval === "ANNUAL" ? "2 months free" : "Billed monthly"}</p>
              <div className="billing-capacity" aria-label={`${plan.name} limits`}>
                <span><Gauge size={14} /><strong>{plan.monthlyDeliveryLimit.toLocaleString("en-IN")}</strong> deliveries</span>
                <span><strong>{plan.automationLimit}</strong> automations</span>
                <span><strong>{plan.instagramConnectionLimit} + {plan.facebookConnectionLimit}</strong> Instagram + Facebook</span>
                <span><strong>{plan.memberLimit}</strong> {plan.memberLimit === 1 ? "seat" : "seats"}</span>
              </div>
              <ul>{plan.features.map((feature) => <li key={feature}><Check size={14} />{feature}</li>)}</ul>
              <button className={`button ${currentBillingSelection ? "button-secondary" : "button-primary"}`} type="button" aria-expanded={pendingChange ? pendingChange.plan === plan.key : undefined} disabled={currentBillingSelection || activating || !view.canManage || !view.billingConfigured || Boolean(busyPlan)} onClick={() => void choosePlan(plan.key)}>
                {currentBillingSelection ? "Your current plan" : busyPlan === plan.key && !pendingChange ? "Opening…" : `Choose ${plan.name}`}
              </button>
            </article>
            {pendingChange?.plan === plan.key ? (
              <div className="billing-plan-confirm">
                <InlineConfirm
                  label={`Confirm switching to ${plan.name}`}
                  message={pendingChange.message}
                  confirmLabel={`Switch to ${plan.name}`}
                  busyLabel="Scheduling…"
                  busy={busyPlan === plan.key}
                  tone="primary"
                  onConfirm={() => void confirmPlanChange()}
                  onCancel={() => setPendingChange(null)}
                />
              </div>
            ) : null}
            </Fragment>
          );
        })}
      </div>

      {view.subscription && (
        <footer className="billing-subscription panel">
          <div className="billing-subscription-copy">
            <strong>Subscription <StatusBadge {...subscriptionStatus(view.subscription.status)} /></strong>
            {view.subscription.currentPeriodEnd && <p className="muted">Paid through {formatDate(view.subscription.currentPeriodEnd)}</p>}
          </div>
          {view.subscription.cancelAtPeriodEnd
            ? <span className="billing-ending">Cancellation scheduled</span>
            : view.canManage && !confirmingCancel && <button className="button button-ghost button-small billing-cancel" type="button" onClick={() => { setPendingChange(null); setConfirmingCancel(true); }}>Cancel at period end</button>}
          {confirmingCancel && !view.subscription.cancelAtPeriodEnd ? (
            <InlineConfirm
              label="Confirm cancelling the subscription"
              message={`Cancel at the end of the current billing cycle? Paid access stays active${view.subscription.currentPeriodEnd ? ` until ${formatDate(view.subscription.currentPeriodEnd)}` : " through the current billing period"}.`}
              confirmLabel="Cancel subscription"
              cancelLabel="Keep subscription"
              busyLabel="Cancelling…"
              busy={cancelling}
              onConfirm={() => void cancelSubscription()}
              onCancel={() => setConfirmingCancel(false)}
            />
          ) : null}
        </footer>
      )}
    </section>
  );
}
