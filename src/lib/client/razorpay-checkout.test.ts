// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { openRazorpaySubscriptionCheckout } from "./razorpay-checkout";

describe("Razorpay Checkout adapter", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.head.innerHTML = "";
    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  });

  it("loads Checkout once for concurrent callers", async () => {
    const first = openRazorpaySubscriptionCheckout({ key: "rzp_test_public", subscriptionId: "sub_1" });
    const second = openRazorpaySubscriptionCheckout({ key: "rzp_test_public", subscriptionId: "sub_2" });
    const scripts = document.querySelectorAll('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    expect(scripts).toHaveLength(1);
    scripts[0].dispatchEvent(new Event("error"));
    await expect(first).rejects.toThrow("checkout_unavailable");
    await expect(second).rejects.toThrow("checkout_unavailable");
  });

  it("fails cleanly when Razorpay's Checkout script never finishes loading", async () => {
    vi.useFakeTimers();
    const result = openRazorpaySubscriptionCheckout({ key: "rzp_test_public", subscriptionId: "sub_1" });
    const rejection = expect(result).rejects.toThrow("checkout_unavailable");

    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
    expect(document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')).toBeNull();
  });

  it("opens Linkar subscription Checkout and returns the verified response", async () => {
    const open = vi.fn();
    let checkoutOptions: Record<string, unknown> | undefined;
    (window as unknown as { Razorpay: new (options: Record<string, unknown>) => { open: () => void } }).Razorpay = class {
      constructor(options: Record<string, unknown>) { checkoutOptions = options; }
      open = open;
    };

    const resultPromise = openRazorpaySubscriptionCheckout({ key: "rzp_test_public", subscriptionId: "sub_1" });
    await Promise.resolve();
    expect(open).toHaveBeenCalledOnce();
    expect(checkoutOptions).toMatchObject({ key: "rzp_test_public", subscription_id: "sub_1", name: "Linkar" });
    (checkoutOptions?.handler as (value: unknown) => void)({
      razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: "a".repeat(64),
    });
    await expect(resultPromise).resolves.toMatchObject({ razorpay_payment_id: "pay_1" });
  });

  it("returns a dismissed outcome when the owner closes Checkout", async () => {
    let checkoutOptions: Record<string, unknown> | undefined;
    (window as unknown as { Razorpay: new (options: Record<string, unknown>) => { open: () => void } }).Razorpay = class {
      constructor(options: Record<string, unknown>) { checkoutOptions = options; }
      open() {}
    };
    const resultPromise = openRazorpaySubscriptionCheckout({ key: "rzp_test_public", subscriptionId: "sub_1" });
    await Promise.resolve();
    ((checkoutOptions?.modal as { ondismiss: () => void }).ondismiss)();
    await expect(resultPromise).resolves.toEqual({ dismissed: true });
  });
});
