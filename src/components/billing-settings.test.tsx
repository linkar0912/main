// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateWorkspaceResource } from "@/src/lib/client/workspace-data";
import { usageTone } from "./settings/prefs";

const checkout = vi.hoisted(() => vi.fn());
vi.mock("@/src/lib/client/razorpay-checkout", () => ({ openRazorpaySubscriptionCheckout: checkout }));
const { BillingSettings } = await import("./billing-settings");

const catalog = [
  { key: "creator", name: "Creator", monthlyPaise: 19900, annualPaise: 199000, memberLimit: 2, automationLimit: 20, instagramConnectionLimit: 2, facebookConnectionLimit: 2, sequenceLimit: 10, monthlyBroadcastLimit: 0, monthlyDeliveryLimit: 5000, features: ["Sequences", "Tracked links"] },
  { key: "growth", name: "Growth", monthlyPaise: 49900, annualPaise: 499000, memberLimit: 5, automationLimit: 50, instagramConnectionLimit: 5, facebookConnectionLimit: 5, sequenceLimit: 25, monthlyBroadcastLimit: 10, monthlyDeliveryLimit: 25000, features: ["Broadcasts", "Exports"] },
  { key: "agency", name: "Agency", monthlyPaise: 99900, annualPaise: 999000, memberLimit: 10, automationLimit: 100, instagramConnectionLimit: 10, facebookConnectionLimit: 10, sequenceLimit: 50, monthlyBroadcastLimit: 25, monthlyDeliveryLimit: 50000, features: ["All launch features"] },
];

function billingView(overrides: Record<string, unknown> = {}) {
  return { data: { catalog, canManage: true, billingConfigured: true, entitlementPlanKey: "free", deliveriesUsed: 120, subscription: null, ...overrides } };
}

describe("BillingSettings", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); checkout.mockReset(); });

  it("shows the exact monthly and annual launch prices and operating limits", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => billingView() }));
    await act(async () => { render(<BillingSettings />); });

    expect(await screen.findByText("₹199")).toBeTruthy();
    expect(screen.getByText("₹499")).toBeTruthy();
    expect(screen.getByText("₹999")).toBeTruthy();
    expect(screen.getByLabelText("Creator limits").textContent).toContain("5,000 deliveries");
    expect(screen.getByLabelText("Agency limits").textContent).toContain("100 automations");
    fireEvent.click(screen.getByRole("radio", { name: /Annual/ }));
    expect(screen.getByText("₹1,990")).toBeTruthy();
    expect(screen.getByText("₹4,990")).toBeTruthy();
    expect(screen.getByText("₹9,990")).toBeTruthy();
    expect(screen.getAllByText("2 months free")).toHaveLength(3);
  });

  it("reuses a recent billing response when the section remounts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => billingView() });
    vi.stubGlobal("fetch", fetchMock);
    const first = render(<BillingSettings />);
    await screen.findByRole("heading", { name: "Plan and usage" });
    first.unmount();

    render(<BillingSettings />);
    await screen.findByRole("heading", { name: "Plan and usage" });

    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/billing")).toHaveLength(1);
  });

  it("keeps the current entitlement in a usage summary and reserves cards for upgrades", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => billingView() }));
    await act(async () => { render(<BillingSettings />); });

    const usage = await screen.findByRole("progressbar", { name: "Monthly delivery usage" });
    expect(usage.getAttribute("aria-valuenow")).toBe("120");
    expect(usage.getAttribute("aria-valuemax")).toBe("1000");
    expect(screen.getByRole("article", { name: "Creator plan" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Growth plan" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Agency plan" })).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Free plan" })).toBeNull();
  });

  it("lets only owners start Checkout and verifies its result", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => billingView() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ready", keyId: "rzp_test_public", subscriptionId: "sub_1", attemptId: "attempt_1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "processing" }) })
      .mockResolvedValue({ ok: true, json: async () => billingView({ entitlementPlanKey: "creator", subscription: { status: "ACTIVE" } }) });
    vi.stubGlobal("fetch", fetchMock);
    checkout.mockResolvedValue({ razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: "a".repeat(64) });
    const workspaceChanged = vi.fn();
    window.addEventListener("linkar-workspace-change", workspaceChanged);
    await act(async () => { render(<BillingSettings />); });
    fireEvent.click(await screen.findByRole("button", { name: "Choose Creator" }));

    await waitFor(() => expect(checkout).toHaveBeenCalledWith({ key: "rzp_test_public", subscriptionId: "sub_1" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/checkout/verify", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText(/activating your plan/i)).toBeTruthy();
    expect(workspaceChanged).toHaveBeenCalled();
    window.removeEventListener("linkar-workspace-change", workspaceChanged);
  });

  it("lets an owner switch the current paid plan from monthly to annual", async () => {
    const activeCreator = billingView({
      entitlementPlanKey: "creator",
      subscription: { status: "ACTIVE", planId: "plan_creator", interval: "MONTHLY", currentPeriodEnd: "2026-11-04T00:00:00.000Z" },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => activeCreator })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "scheduled" }) })
      .mockResolvedValue({ ok: true, json: async () => activeCreator });
    vi.stubGlobal("fetch", fetchMock);
    const workspaceChanged = vi.fn();
    window.addEventListener("linkar-workspace-change", workspaceChanged);
    await act(async () => { render(<BillingSettings />); });

    expect((await screen.findByRole("button", { name: /your current plan/i })).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Annual/ }));
    const annualButton = screen.getByRole("button", { name: /choose creator/i });
    expect(annualButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(annualButton);

    // Asked in place first: nothing is sent until the owner confirms.
    const confirmation = await screen.findByRole("group", { name: "Confirm switching to Creator" });
    expect(confirmation.textContent).toContain("Switch from Creator (monthly) to Creator (annual)?");
    expect(confirmation.textContent).toContain("on 4 Nov 2026, when your current billing cycle ends");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/billing/change-plan", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Switch to Creator" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/change-plan", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ plan: "creator", interval: "ANNUAL" }),
    })));
    expect(await screen.findByText(/Plan change scheduled\. Creator starts on 4 Nov 2026/)).toBeTruthy();
    expect(workspaceChanged).toHaveBeenCalled();
    window.removeEventListener("linkar-workspace-change", workspaceChanged);
  });

  it("changes nothing when the owner declines the plan-change confirmation", async () => {
    const activeCreator = billingView({
      entitlementPlanKey: "creator",
      subscription: { status: "ACTIVE", planId: "plan_creator", interval: "MONTHLY" },
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => activeCreator });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings />); });

    fireEvent.click(await screen.findByRole("button", { name: "Choose Agency" }));

    const confirmation = await screen.findByRole("group", { name: "Confirm switching to Agency" });
    expect(confirmation.textContent).toContain("Switch from Creator (monthly) to Agency (monthly)?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Confirm switching to Agency" })).toBeNull();
    expect(screen.getByRole("button", { name: "Choose Agency" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/billing/change-plan", expect.anything());
  });

  it("routes a checkout refused for an existing subscription to a confirmed plan change", async () => {
    const activeCreator = billingView({
      entitlementPlanKey: "creator",
      subscription: { status: "ACTIVE", planId: "plan_creator", interval: "MONTHLY" },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => billingView() })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "subscription_exists", message: "This workspace already has a subscription." }) })
      .mockResolvedValueOnce({ ok: true, json: async () => activeCreator })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "scheduled" }) })
      .mockResolvedValue({ ok: true, json: async () => activeCreator });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings />); });

    fireEvent.click(await screen.findByRole("button", { name: "Choose Growth" }));

    const confirmation = await screen.findByRole("group", { name: "Confirm switching to Growth" });
    expect(confirmation.textContent).toContain("Switch from Creator (monthly) to Growth (monthly)?");
    fireEvent.click(screen.getByRole("button", { name: "Switch to Growth" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/change-plan", expect.objectContaining({
      body: JSON.stringify({ plan: "growth", interval: "MONTHLY" }),
    })));
    expect(checkout).not.toHaveBeenCalled();
  });

  it("explains a refused checkout when the existing subscription cannot be changed yet", async () => {
    const authenticated = billingView({ subscription: { status: "AUTHENTICATED", planId: "plan_creator", interval: "MONTHLY" } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => billingView() })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "subscription_exists" }) })
      .mockResolvedValue({ ok: true, json: async () => authenticated });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings />); });

    fireEvent.click(await screen.findByRole("button", { name: "Choose Growth" }));

    expect((await screen.findByRole("alert")).textContent).toContain("already has a subscription, so no new checkout was started");
    expect(checkout).not.toHaveBeenCalled();
  });

  it("stops activation polling and prevents a duplicate checkout while Razorpay is delayed", async () => {
    const waitingView = billingView({
      entitlementPlanKey: "free",
      subscription: { status: "AUTHENTICATED", planId: "plan_creator", interval: "MONTHLY" },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => billingView() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ready", keyId: "rzp_test_public", subscriptionId: "sub_1", attemptId: "attempt_1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "processing" }) })
      .mockResolvedValue({ ok: true, json: async () => waitingView });
    vi.stubGlobal("fetch", fetchMock);
    checkout.mockResolvedValue({ razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: "a".repeat(64) });
    await act(async () => { render(<BillingSettings />); });
    const creatorButton = await screen.findByRole("button", { name: "Choose Creator" });
    vi.useFakeTimers();
    fireEvent.click(creatorButton);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByRole("button", { name: "Choose Growth" }).hasAttribute("disabled")).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(screen.getByText(/Razorpay is still confirming your plan/i)).toBeTruthy();
    const callsAfterTimeout = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    expect(fetchMock.mock.calls).toHaveLength(callsAfterTimeout);
  });

  it("explains why members cannot make financial changes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => billingView({ canManage: false }) }));
    await act(async () => { render(<BillingSettings />); });
    expect(await screen.findByText(/Only the workspace owner can change billing/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose Creator" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the granted plan and expiry in a dismissible success popup", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => billingView() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { plan: { key: "creator", name: "Creator" }, expiresAt: "2026-10-05T00:00:00.000Z" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => billingView({ entitlementPlanKey: "creator" }) });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings />); });

    fireEvent.change(await screen.findByLabelText(/premium invite code/i), { target: { value: "LINKAR-ABCD-EFGH-IJKL" } });
    fireEvent.click(screen.getByRole("button", { name: /apply invite/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/invite-code", expect.objectContaining({ method: "POST" })));
    const popup = await screen.findByRole("status");
    expect(popup.textContent).toContain("Invite applied. Creator access is active until 5 Oct 2026.");
    fireEvent.click(screen.getByRole("button", { name: /dismiss notification/i }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    ["invite_code_used", "This invite has already been used"],
    ["premium_access_already_active", "This workspace already has invite access"],
    ["invite_code_expired", "This invite is no longer active"],
    ["invite_code_revoked", "This invite is no longer active"],
    ["invite_code_invalid", "We couldn’t find that invite. Check the code and try again"],
  ])("shows %s redemption failures in an error popup", async (code, expectedMessage) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => billingView() })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: code }) });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings />); });

    fireEvent.change(await screen.findByLabelText(/premium invite code/i), { target: { value: "LINKAR-ABCD-EFGH-IJKL" } });
    fireEvent.click(screen.getByRole("button", { name: /apply invite/i }));

    expect((await screen.findByRole("alert")).textContent).toContain(expectedMessage);
  });

  it("shows a retryable popup when invite redemption cannot reach the server", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => billingView() })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings />); });

    fireEvent.change(await screen.findByLabelText(/premium invite code/i), { target: { value: "LINKAR-ABCD-EFGH-IJKL" } });
    fireEvent.click(screen.getByRole("button", { name: /apply invite/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("We couldn’t apply the invite. Try again.");
  });

  it("asks in place before cancelling, and keeps the subscription when the owner backs out", async () => {
    const activeCreator = billingView({
      entitlementPlanKey: "creator",
      subscription: { status: "ACTIVE", planId: "plan_creator", interval: "MONTHLY", currentPeriodEnd: "2026-11-04T00:00:00.000Z" },
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => activeCreator });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings />); });

    expect((await screen.findByText("Subscription")).textContent).toContain("Active");
    fireEvent.click(screen.getByRole("button", { name: "Cancel at period end" }));
    const confirmation = screen.getByRole("group", { name: "Confirm cancelling the subscription" });
    expect(confirmation.textContent).toContain("Paid access stays active until 4 Nov 2026");
    fireEvent.click(screen.getByRole("button", { name: "Keep subscription" }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/billing/cancel", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Cancel at period end" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" })); });
    expect(fetchMock).toHaveBeenCalledWith("/api/billing/cancel", { method: "POST" });
    expect(await screen.findByText(/Cancellation scheduled\. Paid access stays active/)).toBeTruthy();
  });

  it("offers Try again when billing fails to load, and recovers", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue({ ok: true, json: async () => billingView() });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings />); });

    expect((await screen.findByRole("alert")).textContent).toContain("Billing details could not be loaded");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    expect(await screen.findByText("₹199")).toBeTruthy();
  });
});

describe("BillingSettings usage meters", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); invalidateWorkspaceResource("billing"); });

  it("meters deliveries, accounts and seats against the current plan", async () => {
    invalidateWorkspaceResource("billing");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => billingView({ entitlementPlanKey: "creator", deliveriesUsed: 4_200 }) }));
    await act(async () => { render(<BillingSettings usage={{ instagram: 2, facebook: 0, seats: 1 }} />); });

    const deliveries = await screen.findByRole("progressbar", { name: "Monthly delivery usage" });
    expect(deliveries.getAttribute("aria-valuemax")).toBe("5000");
    // 84% of a monthly allowance: amber.
    expect(deliveries.closest(".prefs-meter")?.getAttribute("data-tone")).toBe("warning");
    // Every Instagram slot taken: amber; one of two seats: quiet.
    expect(screen.getByRole("progressbar", { name: "Instagram accounts" }).closest(".prefs-meter")?.getAttribute("data-tone")).toBe("warning");
    expect(screen.getByRole("progressbar", { name: "Team seats" }).closest(".prefs-meter")?.getAttribute("data-tone")).toBe("normal");
    expect(screen.getByText("Creator plan")).toBeTruthy();
  });

  it("leaves account and seat meters out when Settings has not loaded them", async () => {
    invalidateWorkspaceResource("billing");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => billingView() }));
    await act(async () => { render(<BillingSettings />); });

    await screen.findByRole("progressbar", { name: "Monthly delivery usage" });
    expect(screen.queryByRole("progressbar", { name: "Team seats" })).toBeNull();
    // No paid subscription: nothing to cancel.
    expect(screen.queryByRole("region", { name: "Danger zone" })).toBeNull();
  });

  it("keeps cancelling in the danger zone, only for someone who can manage billing", async () => {
    const subscription = { status: "ACTIVE", planId: "plan_creator", interval: "MONTHLY", currentPeriodEnd: "2026-11-04T00:00:00.000Z" };
    invalidateWorkspaceResource("billing");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => billingView({ entitlementPlanKey: "creator", subscription }) }));
    const first = await act(async () => render(<BillingSettings />));
    const danger = await screen.findByRole("region", { name: "Danger zone" });
    expect(within(danger).getByRole("button", { name: "Cancel at period end" })).toBeTruthy();
    first.unmount();

    invalidateWorkspaceResource("billing");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => billingView({ entitlementPlanKey: "creator", subscription, canManage: false }) }));
    await act(async () => { render(<BillingSettings />); });
    await screen.findByText(/Only the workspace owner can change billing/);
    expect(screen.queryByRole("region", { name: "Danger zone" })).toBeNull();
  });
});

describe("BillingSettings with a plan picked on /pricing", () => {
  type Shell = { planIntent?: { plan: string; interval: string } | null; onboarding?: { required: boolean } | null };
  const done = { required: false };

  function routes(view: ReturnType<typeof billingView>, shell: Shell) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/billing") return { ok: true, json: async () => view };
      if (url === "/api/workspace/bootstrap") return { ok: true, json: async () => ({ data: { email: "owner@acme.test", role: "OWNER", plan: "free", ...shell } }) };
      if (url === "/api/billing/plan-intent" && init?.method === "DELETE") return { ok: true, json: async () => ({ data: { cleared: true } }) };
      if (url === "/api/billing/checkout") return { ok: true, json: async () => ({ status: "ready", keyId: "rzp_test_public", subscriptionId: "sub_intent" }) };
      if (url === "/api/billing/checkout/verify") return { ok: true, json: async () => ({ data: { verified: true } }) };
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  function calls(fetchMock: ReturnType<typeof routes>, url: string) {
    return fetchMock.mock.calls.filter(([called]) => called === url);
  }

  beforeEach(() => {
    invalidateWorkspaceResource("billing");
    invalidateWorkspaceResource("bootstrap");
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); checkout.mockReset(); });

  it("opens the existing checkout for the saved plan and period, then forgets the intent", async () => {
    const fetchMock = routes(billingView(), { planIntent: { plan: "growth", interval: "ANNUAL" }, onboarding: done });
    vi.stubGlobal("fetch", fetchMock);
    checkout.mockResolvedValue({ razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_intent", razorpay_signature: "a".repeat(64) });

    await act(async () => { render(<BillingSettings preselect={{ plan: "growth", interval: "ANNUAL" }} />); });

    await waitFor(() => expect(checkout).toHaveBeenCalledWith({ key: "rzp_test_public", subscriptionId: "sub_intent" }));
    expect(JSON.parse(String(calls(fetchMock, "/api/billing/checkout")[0]?.[1]?.body))).toEqual({ plan: "growth", interval: "ANNUAL" });
    expect(calls(fetchMock, "/api/billing/plan-intent")).toHaveLength(1);
    expect((screen.getByRole("radio", { name: /Annual/ }) as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect(calls(fetchMock, "/api/billing/checkout/verify")).toHaveLength(1));
    expect(await screen.findByText("Payment received. We’re activating your plan now.")).toBeTruthy();
  });

  it("does not reopen a dismissed checkout when Billing remounts", async () => {
    const fetchMock = routes(billingView(), { planIntent: { plan: "creator", interval: "MONTHLY" }, onboarding: done });
    vi.stubGlobal("fetch", fetchMock);
    checkout.mockResolvedValue({ dismissed: true });

    const first = render(<BillingSettings preselect={{ plan: "creator", interval: "MONTHLY" }} />);
    await waitFor(() => expect(checkout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose Creator" })).toBeTruthy());
    expect(calls(fetchMock, "/api/billing/plan-intent")).toHaveLength(1);
    expect(calls(fetchMock, "/api/billing/checkout/verify")).toHaveLength(0);
    first.unmount();

    // The cleared cookie no longer rides the shell payload.
    vi.stubGlobal("fetch", routes(billingView(), { planIntent: null, onboarding: done }));
    render(<BillingSettings preselect={{ plan: "creator", interval: "MONTHLY" }} />);
    await screen.findByRole("button", { name: "Choose Creator" });
    await act(async () => { await Promise.resolve(); });
    expect(checkout).toHaveBeenCalledTimes(1);
  });

  it("only pre-selects the period when the URL plan is not the saved intent", async () => {
    const fetchMock = routes(billingView(), { planIntent: null, onboarding: done });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings preselect={{ plan: "agency", interval: "ANNUAL" }} />); });
    await screen.findByRole("button", { name: "Choose Agency" });
    await waitFor(() => expect(calls(fetchMock, "/api/workspace/bootstrap")).toHaveLength(1));
    await act(async () => { await Promise.resolve(); });

    expect((screen.getByRole("radio", { name: /Annual/ }) as HTMLInputElement).checked).toBe(true);
    expect(checkout).not.toHaveBeenCalled();
    expect(calls(fetchMock, "/api/billing/checkout")).toHaveLength(0);
    expect(calls(fetchMock, "/api/billing/plan-intent")).toHaveLength(0);
  });

  it("waits for onboarding before opening checkout", async () => {
    const fetchMock = routes(billingView(), { planIntent: { plan: "growth", interval: "MONTHLY" }, onboarding: { required: true } });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings preselect={{ plan: "growth", interval: "MONTHLY" }} />); });
    await waitFor(() => expect(calls(fetchMock, "/api/workspace/bootstrap")).toHaveLength(1));
    await act(async () => { await Promise.resolve(); });

    expect(checkout).not.toHaveBeenCalled();
    expect(calls(fetchMock, "/api/billing/plan-intent")).toHaveLength(0);
  });

  it("shows the normal Billing view when the workspace already has the plan or a subscription", async () => {
    for (const view of [
      billingView({ entitlementPlanKey: "growth" }),
      billingView({ entitlementPlanKey: "creator", subscription: { status: "ACTIVE", planId: "plan_creator", interval: "MONTHLY" } }),
    ]) {
      invalidateWorkspaceResource("billing");
      invalidateWorkspaceResource("bootstrap");
      const fetchMock = routes(view, { planIntent: { plan: "growth", interval: "MONTHLY" }, onboarding: done });
      vi.stubGlobal("fetch", fetchMock);
      const rendered = render(<BillingSettings preselect={{ plan: "growth", interval: "MONTHLY" }} />);
      await screen.findByRole("heading", { name: "Plan and usage" });
      await waitFor(() => expect(calls(fetchMock, "/api/billing/plan-intent")).toHaveLength(1));

      expect(checkout).not.toHaveBeenCalled();
      expect(calls(fetchMock, "/api/billing/checkout")).toHaveLength(0);
      expect(calls(fetchMock, "/api/billing/change-plan")).toHaveLength(0);
      expect(screen.queryByRole("button", { name: /Switch to/ })).toBeNull();
      rendered.unmount();
    }
  });

  it("never opens checkout for a member, and still uses the intent up", async () => {
    const fetchMock = routes(billingView({ canManage: false }), { planIntent: { plan: "growth", interval: "MONTHLY" }, onboarding: done });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings preselect={{ plan: "growth", interval: "MONTHLY" }} />); });
    await waitFor(() => expect(calls(fetchMock, "/api/billing/plan-intent")).toHaveLength(1));
    expect(checkout).not.toHaveBeenCalled();
    expect(calls(fetchMock, "/api/billing/checkout")).toHaveLength(0);
  });
});

describe("usageTone", () => {
  it("warns at 80% of an allowance and alarms when it is used up", () => {
    expect(usageTone(799, 1000, "allowance")).toBe("normal");
    expect(usageTone(800, 1000, "allowance")).toBe("warning");
    expect(usageTone(1000, 1000, "allowance")).toBe("danger");
  });

  it("only warns about counts when every slot is taken", () => {
    expect(usageTone(4, 5, "count")).toBe("normal");
    expect(usageTone(1, 1, "count")).toBe("warning");
    expect(usageTone(6, 5, "count")).toBe("danger");
    expect(usageTone(3, 0, "count")).toBe("normal");
  });
});
