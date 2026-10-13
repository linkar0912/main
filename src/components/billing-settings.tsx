"use client";

import { Presence } from "@/src/components/ui/use-presence";
import { slidingThumbRef } from "@/src/components/ui/use-sliding-thumb";
import { Check } from "lucide-react";
import { Fragment, useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import { openRazorpaySubscriptionCheckout } from "@/src/lib/client/razorpay-checkout";
import { getBillingView, getWorkspaceBootstrap, invalidateWorkspaceResource, notifyWorkspaceChanged, type BillingView } from "@/src/lib/client/workspace-data";
import { clearPlanIntent } from "@/src/lib/client/plan-intent";
import { planIntentCheckoutAction, samePlanIntent, type PlanIntent } from "@/src/lib/billing/plan-intent";
import { FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import type { BillingInterval, BillingPlanKey } from "@/src/lib/billing/types";
import { ActionNotice } from "./action-notice";
import { InlineConfirm } from "./inline-confirm";
import { InlineContentSkeleton } from "./skeleton";
import { StatusBadge, type StatusTone } from "./ui/status-badge";
import { PrefsGroupHead, PrefsSectionHead, UsageMeter } from "./settings/prefs";

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

/** What the workspace uses against its plan, when Settings already knows it. */
export type BillingUsage = { instagram: number; facebook: number; seats?: number };

export function BillingSettings({ usage, back, preselect }: {
  /** Connected accounts and team seats in use; their meters are left out without it. */
  usage?: BillingUsage;
  /** The phone-only "Settings" back link of the drill-in layout. */
  back?: ReactNode;
  /**
   * A plan picked on /pricing (?plan=&interval= on the Settings URL). Its
   * billing period is pre-selected; when it is also the signed-in owner's
   * saved intent, its checkout opens by itself, once.
   */
  preselect?: PlanIntent | null;
} = {}) {
  const [view, setView] = useState<BillingView | null>(null);
  const [interval, setInterval] = useState<BillingInterval>(preselect?.interval ?? "MONTHLY");
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

  // A plan picked on /pricing opens its checkout here, through the same
  // choosePlan as the plan buttons. The URL alone never opens a checkout: it
  // must match the owner's saved intent (an HttpOnly cookie, surfaced on the
  // shell payload), and onboarding must be out of the way. The intent is used
  // up either way, so a dismissed checkout never reopens by itself; a
  // workspace that already has the plan or a subscription just sees Billing.
  const intentHandled = useRef(false);
  const openPlanIntent = useEffectEvent(async (current: BillingView, wanted: PlanIntent) => {
    const shell = await getWorkspaceBootstrap().catch(() => null);
    if (!shell || !samePlanIntent(shell.planIntent, wanted) || shell.onboarding?.required) return;
    void clearPlanIntent();
    if (planIntentCheckoutAction(current, wanted) === "checkout") await choosePlan(wanted.plan, wanted.interval);
  });
  const preselectPlan = preselect?.plan;
  const preselectInterval = preselect?.interval;
  useEffect(() => {
    if (!view || !preselectPlan || !preselectInterval || intentHandled.current) return;
    intentHandled.current = true;
    void openPlanIntent(view, { plan: preselectPlan, interval: preselectInterval });
  }, [view, preselectPlan, preselectInterval]);

  // Razorpay applies plan changes at the end of the current cycle
  // (schedule_change_at: cycle_end): nothing is prorated or charged today.
  // Asking first: the confirmation appears in the plan card, and nothing is
  // sent until the owner confirms it there.
  function requestPlanChange(current: BillingView, plan: BillingPlanKey, nextInterval: BillingInterval = interval): void {
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
      interval: nextInterval,
      nextName,
      effective,
      message: `Switch from ${currentName} (${intervalLabel(subscription.interval)}) to ${nextName} (${intervalLabel(nextInterval)})? `
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

  async function choosePlan(plan: BillingPlanKey, chosenInterval: BillingInterval = interval) {
    if (!view?.canManage || busyPlan) return;
    setBusyPlan(plan);
    setError("");
    setMessage("");
    try {
      if (view.subscription?.status === "ACTIVE") {
        requestPlanChange(view, plan, chosenInterval);
        return;
      }
      const response = await fetch("/api/billing/checkout", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, interval: chosenInterval }),
      });
      const checkout = await response.json() as { status?: string; keyId?: string; subscriptionId?: string; error?: string };
      if (checkout.error === "subscription_exists") {
        // The cached view was stale: the workspace already pays, so switch
        // plans on that subscription rather than opening a second checkout.
        const latest = await refreshAfterChange();
        if (latest.subscription?.status === "ACTIVE") requestPlanChange(latest, plan, chosenInterval);
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
              : code === "rate_limited" ? "Too many attempts. Try again in an hour"
                : "We couldn’t apply the invite. Try again.";
      setInviteNotice({ tone: "error", message });
    } finally {
      setRedeemingInvite(false);
    }
  }

  const head = (
    <PrefsSectionHead
      id="billing-section-title"
      title="Billing"
      description="Your plan, what this workspace has used this month, and the other plans. Prices include GST."
      back={back}
    />
  );
  if (!view && !error) return <section className="billing-shell" aria-label="Billing">{head}<InlineContentSkeleton label="Loading billing" rows={4} /></section>;
  if (!view) {
    return (
      <section className="billing-shell" aria-label="Billing">
        {head}
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
  const subscription = view.subscription;
  const billedPlan = subscription?.planId ? plans.find((plan) => `plan_${plan.key}` === subscription.planId) : undefined;
  const billedPrice = billedPlan && subscription?.status === "ACTIVE"
    ? `${formatRupees(subscription.interval === "ANNUAL" ? billedPlan.annualPaise : billedPlan.monthlyPaise)} a ${subscription.interval === "ANNUAL" ? "year" : "month"}`
    : null;
  return (
    <section className="billing-shell" aria-labelledby="billing-section-title">
      <Presence>{inviteNotice ? <ActionNotice tone={inviteNotice.tone} message={inviteNotice.message} onDismiss={() => setInviteNotice(null)} /> : null}</Presence>
      {head}

      {!view.canManage && <p className="notice-banner notice-warning">Only the workspace owner can change billing. You can still review plans and usage.</p>}
      {!view.billingConfigured && <p className="notice-banner notice-warning">Secure checkout is unavailable because the payment connection is incomplete. Plan changes will be enabled once the setup is finished.</p>}
      {message && <p className="notice-banner notice-success" role="status"><Check size={17} /> {message}</p>}
      {error && <p className="notice-banner notice-warning" role="alert">{error}</p>}

      <section className="prefs-group" aria-labelledby="billing-title">
        <PrefsGroupHead id="billing-title" title="Plan and usage" />
        <div className="prefs-card billing-summary" aria-label="Current billing summary" role="group">
          <div className="billing-summary-head">
            <div className="billing-summary-plan">
              <span className="plan-tag">{currentPlan.name}</span>
              <strong>{currentPlan.name} plan</strong>
              {billedPrice ? <span className="billing-summary-price">{billedPrice}</span> : null}
            </div>
            {subscription ? (
              <div className="billing-summary-status">
                <p className="billing-subscription-line">Subscription <StatusBadge {...subscriptionStatus(subscription.status)} /></p>
                {subscription.currentPeriodEnd ? (
                  <p className="muted">
                    {subscription.cancelAtPeriodEnd ? "Ends" : "Paid through"} {formatDate(subscription.currentPeriodEnd)}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="billing-summary-status muted">No paid subscription. Choose a plan below to upgrade.</p>
            )}
          </div>
          <div className="billing-meters">
            <UsageMeter label="Deliveries this month" ariaLabel="Monthly delivery usage" used={view.deliveriesUsed} limit={usageMaximum} />
            {usage ? (
              <>
                <UsageMeter kind="count" label="Instagram accounts" used={usage.instagram} limit={currentPlan.instagramConnectionLimit} />
                <UsageMeter kind="count" label="Facebook Pages" used={usage.facebook} limit={currentPlan.facebookConnectionLimit} />
                {usage.seats !== undefined ? <UsageMeter kind="count" label="Team seats" used={usage.seats} limit={currentPlan.memberLimit} /> : null}
              </>
            ) : null}
          </div>
          <p className="billing-remaining muted">{Math.max(0, usageMaximum - view.deliveriesUsed).toLocaleString("en-IN")} deliveries left this month</p>
        </div>
      </section>

      <section className="prefs-group" aria-labelledby="billing-plans-title">
        <PrefsGroupHead
          id="billing-plans-title"
          title="Plans"
          description="Switching plans takes effect at the end of the current billing cycle."
          action={(
            <fieldset ref={slidingThumbRef} className="segmented billing-period" aria-label="Billing period">
              <legend>Billing period</legend>
              <label className="segmented-option"><input type="radio" name="billing-period" value="MONTHLY" checked={interval === "MONTHLY"} onChange={() => { setInterval("MONTHLY"); setPendingChange(null); }} /> Monthly</label>
              <label className="segmented-option"><input type="radio" name="billing-period" value="ANNUAL" checked={interval === "ANNUAL"} onChange={() => { setInterval("ANNUAL"); setPendingChange(null); }} /> Annual <span className="segmented-badge">Save 2 months</span></label>
            </fieldset>
          )}
        />
        <div className="billing-plan-grid">
          {view.catalog.map((plan) => {
            const current = view.entitlementPlanKey === plan.key;
            const currentBillingSelection = view.subscription?.status === "ACTIVE"
              && view.subscription.planId === `plan_${plan.key}`
              && view.subscription.interval === interval;
            const price = interval === "ANNUAL" ? plan.annualPaise : plan.monthlyPaise;
            return (
              <Fragment key={plan.key}>
                <article className={`billing-plan${current ? " is-current" : ""}`} aria-label={`${plan.name} plan`}>
                  <div className="billing-plan-top">
                    <h4>{plan.name}</h4>
                    {current ? <span className="billing-plan-flag">Current</span> : plan.key === "growth" ? <span className="billing-plan-flag is-quiet">Best fit</span> : null}
                  </div>
                  <p className="billing-price"><strong>{formatRupees(price)}</strong><span>/{interval === "ANNUAL" ? "year" : "month"}</span></p>
                  <p className="billing-saving">{interval === "ANNUAL" ? "2 months free" : "Billed monthly"}</p>
                  <ul className="billing-capacity" aria-label={`${plan.name} limits`}>
                    <li><strong>{plan.monthlyDeliveryLimit.toLocaleString("en-IN")}</strong> deliveries a month</li>
                    <li><strong>{plan.automationLimit}</strong> automations</li>
                    <li><strong>{plan.instagramConnectionLimit} + {plan.facebookConnectionLimit}</strong> Instagram + Facebook</li>
                    <li><strong>{plan.memberLimit}</strong> team {plan.memberLimit === 1 ? "seat" : "seats"}</li>
                  </ul>
                  <ul className="billing-features">{plan.features.map((feature) => <li key={feature}><Check size={14} aria-hidden="true" />{feature}</li>)}</ul>
                  <button className={`button ${currentBillingSelection ? "button-secondary" : current ? "button-secondary" : "button-primary"}`} type="button" aria-expanded={pendingChange ? pendingChange.plan === plan.key : undefined} disabled={currentBillingSelection || activating || !view.canManage || !view.billingConfigured || Boolean(busyPlan)} onClick={() => void choosePlan(plan.key)}>
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
      </section>

      <section className="prefs-group" aria-labelledby="premium-invite-title">
        <PrefsGroupHead id="premium-invite-title" title="Invite code" />
        <div className="prefs-card">
          <div className="prefs-row billing-code">
            <div className="prefs-row-copy">
              <strong>Have an invite code?</strong>
              <small>It unlocks the plan in your invite for 30 days. Your subscription doesn’t change, and a higher plan you already pay for stays.</small>
            </div>
            <div className="billing-code-form">
              <label className="sr-only" htmlFor="premium-invite-code">Premium invite code</label>
              <input id="premium-invite-code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="LINKAR-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} />
              <button className="button button-secondary billing-code-submit" type="button" disabled={!view.canManage || !inviteCode.trim() || redeemingInvite} onClick={() => void redeemInvite()}>{redeemingInvite ? "Applying…" : "Apply invite"}</button>
            </div>
          </div>
        </div>
      </section>

      {subscription && (subscription.cancelAtPeriodEnd || view.canManage) ? (
        <section className="prefs-group prefs-danger-zone" aria-labelledby="billing-danger-title">
          <PrefsGroupHead id="billing-danger-title" title="Danger zone" />
          <div className="prefs-card">
            <div className="prefs-row billing-cancel-row">
              <div className="prefs-row-copy">
                <strong>Cancel subscription</strong>
                <small>
                  {subscription.cancelAtPeriodEnd
                    ? `Cancellation is scheduled. Paid access stays active${subscription.currentPeriodEnd ? ` until ${formatDate(subscription.currentPeriodEnd)}` : " through the current billing period"}.`
                    : `Stops renewal at the end of the current billing cycle. Paid features stay on${subscription.currentPeriodEnd ? ` until ${formatDate(subscription.currentPeriodEnd)}` : " until then"}.`}
                </small>
              </div>
              <div className="prefs-row-control">
                {subscription.cancelAtPeriodEnd
                  ? <span className="billing-ending">Cancellation scheduled</span>
                  : !confirmingCancel && <button className="button button-secondary button-small prefs-danger-text billing-cancel" type="button" onClick={() => { setPendingChange(null); setConfirmingCancel(true); }}>Cancel at period end</button>}
              </div>
              {confirmingCancel && !subscription.cancelAtPeriodEnd ? (
                <InlineConfirm
                  label="Confirm cancelling the subscription"
                  message={`Cancel at the end of the current billing cycle? Paid access stays active${subscription.currentPeriodEnd ? ` until ${formatDate(subscription.currentPeriodEnd)}` : " through the current billing period"}.`}
                  confirmLabel="Cancel subscription"
                  cancelLabel="Keep subscription"
                  busyLabel="Cancelling…"
                  busy={cancelling}
                  onConfirm={() => void cancelSubscription()}
                  onCancel={() => setConfirmingCancel(false)}
                />
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
