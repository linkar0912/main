"use client";

import { Check, CreditCard, Gauge, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { openRazorpaySubscriptionCheckout } from "@/src/lib/client/razorpay-checkout";
import type { BillingCatalogPlan, BillingInterval, BillingPlanKey } from "@/src/lib/billing/types";

type BillingView = {
  catalog: BillingCatalogPlan[];
  canManage: boolean;
  billingConfigured: boolean;
  entitlementPlanKey: string;
  deliveriesUsed: number;
  subscription: null | {
    status: string;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    pendingPlanId?: string | null;
  };
};

const FREE_PLAN = {
  key: "free",
  name: "Free",
  monthlyPaise: 0,
  annualPaise: 0,
  memberLimit: 1,
  automationLimit: 5,
  instagramConnectionLimit: 1,
  facebookConnectionLimit: 1,
  monthlyDeliveryLimit: 1_000,
  features: ["Core automations", "Instagram and Facebook"],
} as const;

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

  const load = useCallback(async () => {
    const response = await fetch("/api/billing");
    const payload = await response.json() as { data?: BillingView; error?: string };
    if (!response.ok || !payload.data) throw new Error(payload.error ?? "billing_load_failed");
    setView(payload.data);
    return payload.data;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/billing", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { data?: BillingView; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "billing_load_failed");
        setView(payload.data);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("Billing details could not be loaded. Try again.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!activating) return;
    const timer = window.setInterval(() => {
      void load().then((next) => {
        if (next.subscription?.status === "ACTIVE") {
          setActivating(false);
          setMessage("Your plan is active.");
        }
      }).catch(() => undefined);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [activating, load]);

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
        await load();
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
    await load().catch(() => undefined);
  }

  if (!view && !error) return <section className="panel billing-shell" aria-label="Billing"><p className="muted">Loading billing…</p></section>;
  if (!view) return <section className="panel billing-shell" aria-label="Billing"><p className="form-error" role="alert">{error}</p></section>;

  const plans = [FREE_PLAN, ...view.catalog];
  return (
    <section className="billing-shell" aria-labelledby="billing-title">
      <header className="billing-heading panel">
        <div>
          <p className="eyebrow">Plan & usage</p>
          <h2 id="billing-title">Simple pricing. Room to grow.</h2>
          <p className="muted">Every price includes applicable GST. Annual plans give you two months free.</p>
        </div>
        <div className="billing-current" aria-label="Current billing summary">
          <CreditCard size={18} />
          <span><small>Current plan</small><strong>{view.entitlementPlanKey.charAt(0).toUpperCase() + view.entitlementPlanKey.slice(1)}</strong></span>
          <span><small>Deliveries this month</small><strong>{view.deliveriesUsed.toLocaleString("en-IN")}</strong></span>
        </div>
      </header>

      {!view.canManage && <p className="notice-banner notice-warning">Only the workspace owner can change billing. You can still review plans and usage.</p>}
      {!view.billingConfigured && <p className="notice-banner notice-warning">Secure checkout is being configured. Plan changes are temporarily unavailable.</p>}
      {message && <p className="notice-banner notice-success" role="status"><Check size={17} /> {message}</p>}
      {error && <p className="notice-banner notice-warning" role="alert">{error}</p>}

      <fieldset className="billing-period" aria-label="Billing period">
        <legend>Billing period</legend>
        <label><input type="radio" name="billing-period" value="MONTHLY" checked={interval === "MONTHLY"} onChange={() => setInterval("MONTHLY")} /> Monthly</label>
        <label><input type="radio" name="billing-period" value="ANNUAL" checked={interval === "ANNUAL"} onChange={() => setInterval("ANNUAL")} /> Annual</label>
      </fieldset>

      <div className="billing-plan-grid">
        {plans.map((plan) => {
          const isFree = plan.key === "free";
          const current = view.entitlementPlanKey === plan.key;
          const price = interval === "ANNUAL" ? plan.annualPaise : plan.monthlyPaise;
          return (
            <article className={`billing-plan ${current ? "is-current" : ""}`} key={plan.key}>
              <div className="billing-plan-top">
                <h3>{plan.name}</h3>
                {current && <span className="billing-plan-current"><Sparkles size={13} /> Current</span>}
              </div>
              <p className="billing-price"><strong>{formatRupees(price)}</strong><span>/{interval === "ANNUAL" ? "year" : "month"}</span></p>
              {interval === "ANNUAL" && !isFree && <p className="billing-saving">2 months free</p>}
              <div className="billing-capacity" aria-label={`${plan.name} limits`}>
                <span><Gauge size={14} /><strong>{plan.monthlyDeliveryLimit.toLocaleString("en-IN")}</strong> deliveries</span>
                <span><strong>{plan.automationLimit}</strong> automations</span>
                <span><strong>{plan.instagramConnectionLimit} + {plan.facebookConnectionLimit}</strong> Instagram + Facebook</span>
                <span><strong>{plan.memberLimit}</strong> {plan.memberLimit === 1 ? "seat" : "seats"}</span>
              </div>
              <ul>{plan.features.map((feature) => <li key={feature}><Check size={14} />{feature}</li>)}</ul>
              <button className={`button ${current ? "button-secondary" : "button-primary"}`} type="button" disabled={isFree || current || !view.canManage || !view.billingConfigured || Boolean(busyPlan)} onClick={() => !isFree && void choosePlan(plan.key)}>
                {current ? "Current plan" : isFree ? "Included" : busyPlan === plan.key ? "Opening…" : `Choose ${plan.name}`}
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
