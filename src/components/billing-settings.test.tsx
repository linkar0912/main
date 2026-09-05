// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); checkout.mockReset(); });

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
    await act(async () => { render(<BillingSettings />); });
    fireEvent.click(await screen.findByRole("button", { name: "Choose Creator" }));

    await waitFor(() => expect(checkout).toHaveBeenCalledWith({ key: "rzp_test_public", subscriptionId: "sub_1" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/checkout/verify", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText(/activating your plan/i)).toBeTruthy();
  });

  it("lets an owner switch the current paid plan from monthly to annual", async () => {
    const activeCreator = billingView({
      entitlementPlanKey: "creator",
      subscription: { status: "ACTIVE", planId: "plan_creator", interval: "MONTHLY" },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => activeCreator })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "scheduled" }) })
      .mockResolvedValue({ ok: true, json: async () => activeCreator });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<BillingSettings />); });

    expect((await screen.findByRole("button", { name: /current billing/i })).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Annual/ }));
    const annualButton = screen.getByRole("button", { name: /choose creator/i });
    expect(annualButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(annualButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/change-plan", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ plan: "creator", interval: "ANNUAL" }),
    })));
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
});
