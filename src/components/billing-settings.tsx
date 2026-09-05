"use client";

import { Check, CreditCard, Gauge, Sparkles, TicketCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { openRazorpaySubscriptionCheckout } from "@/src/lib/client/razorpay-checkout";
import { getBillingView, invalidateWorkspaceResource, type BillingView } from "@/src/lib/client/workspace-data";
import { FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import type { BillingInterval, BillingPlanKey } from "@/src/lib/billing/types";
import { ActionNotice } from "./action-notice";

const ACTIVATION_POLL_MS = 3_000;
const ACTIVATION_TIMEOUT_MS = 45_000;

function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

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

  const load = useCallback(async (fresh = false) => {
    if (fresh) invalidateWorkspaceResource("billing");
    const next = await getBillingView();
    setView(next);
    return next;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getBillingView(controller.signal)
      .then(setView)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("Billing details could not be loaded. Try again.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!activating) return;
    const pollTimer = window.setInterval(() => {
      void load(true).then((next) => {
        if (next.subscription?.status === "ACTIVE") {
          setActivating(false);
          setMessage("Your plan is active.");
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

  async function choosePlan(plan: BillingPlanKey) {
    if (!view?.canManage || busyPlan) return;
    setBusyPlan(plan);
    setError("");
    setMessage("");
    try {
      if (view.subscription?.status === "ACTIVE") {
        const response = await fetch("/api/billing/change-plan", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, interval }),
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "plan_change_failed");
        setMessage("Plan change scheduled for your next billing cycle.");
        await load(true);
        return;
      }
      const response = await fetch("/api/billing/checkout", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, interval }),
      });
      const checkout = await response.json() as { status?: string; keyId?: string; subscriptionId?: string; error?: string };
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
      setActivating(true);
      setMessage("Payment received. We’re activating your plan now.");
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "billing_failed";
      setError(code === "provider_unavailable"
        ? "Razorpay is temporarily unavailable. No plan change was made."
        : "Billing could not be updated. Check your connection and try again.");
    } finally {
      setBusyPlan("");
    }
  }

  async function cancelSubscription() {
    if (!view?.canManage || !window.confirm("Cancel at the end of the current billing cycle?")) return;
    setError("");
    const response = await fetch("/api/billing/cancel", { method: "POST" });
    if (!response.ok) {
      setError("Cancellation could not be scheduled. Try again.");
      return;
    }
    setMessage("Cancellation scheduled. Paid access stays active through the current billing period.");
    await load(true).catch(() => undefined);
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
      await load(true);
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

  if (!view && !error) return <section className="panel billing-shell" aria-label="Billing"><p className="muted">Loading billing…</p></section>;
  if (!view) return <section className="panel billing-shell" aria-label="Billing"><p className="form-error" role="alert">{error}</p></section>;

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
        <fieldset className="billing-period" aria-label="Billing period">
          <legend>Billing period</legend>
          <label><input type="radio" name="billing-period" value="MONTHLY" checked={interval === "MONTHLY"} onChange={() => setInterval("MONTHLY")} /> Monthly</label>
          <label><input type="radio" name="billing-period" value="ANNUAL" checked={interval === "ANNUAL"} onChange={() => setInterval("ANNUAL")} /> Annual</label>
          <span>Save 2 months</span>
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
          <div><small>Limited-time plan access</small><h3 id="premium-invite-title">Invite access</h3><p>Enter your code to unlock the plan included with your invite for 30 days. Your current subscription stays unchanged.</p></div>
        </div>
        <div className="billing-invite-form">
          <label className="sr-only" htmlFor="premium-invite-code">Premium invite code</label>
          <input id="premium-invite-code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="LINKAR-XXXX-XXXX-XXXX" autoComplete="off" />
          <button className="button button-primary" type="button" disabled={!view.canManage || !inviteCode.trim() || redeemingInvite} onClick={() => void redeemInvite()}>{redeemingInvite ? "Applying…" : "Apply invite"}</button>
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
            <article className={`billing-plan ${current ? "is-current" : ""} ${plan.key === "growth" ? "is-featured" : ""}`} aria-label={`${plan.name} plan`} key={plan.key}>
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
              <button className={`button ${currentBillingSelection ? "button-secondary" : "button-primary"}`} type="button" disabled={currentBillingSelection || activating || !view.canManage || !view.billingConfigured || Boolean(busyPlan)} onClick={() => void choosePlan(plan.key)}>
                {currentBillingSelection ? "Current billing" : busyPlan === plan.key ? "Opening…" : `Choose ${plan.name}`}
              </button>
            </article>
          );
        })}
      </div>

      {view.subscription && (
        <footer className="billing-subscription panel">
          <div><strong>Subscription {view.subscription.status.toLowerCase()}</strong>{view.subscription.currentPeriodEnd && <p className="muted">Paid through {formatDate(view.subscription.currentPeriodEnd)}</p>}</div>
          {view.subscription.cancelAtPeriodEnd ? <span className="billing-ending">Cancellation scheduled</span> : view.canManage && <button className="text-link" type="button" onClick={() => void cancelSubscription()}>Cancel at period end</button>}
        </footer>
      )}
    </section>
  );
}
