export type RazorpayCheckoutSuccess = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

export type RazorpayCheckoutOutcome = RazorpayCheckoutSuccess | { dismissed: true };

type RazorpayConstructor = new (options: Record<string, unknown>) => { open(): void };

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let checkoutLoad: Promise<void> | undefined;
const CHECKOUT_LOAD_TIMEOUT_MS = 15_000;
const CHECKOUT_COMPLETION_TIMEOUT_MS = 5 * 60 * 1_000;

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutLoad) return checkoutLoad;
  checkoutLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      checkoutLoad = undefined;
      reject(new Error("checkout_unavailable"));
    };
    const timeout = window.setTimeout(fail, CHECKOUT_LOAD_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return checkoutLoad;
}

export async function openRazorpaySubscriptionCheckout(input: {
  key: string;
  subscriptionId: string;
}): Promise<RazorpayCheckoutOutcome> {
  await loadCheckout();
  if (!window.Razorpay) throw new Error("checkout_unavailable");
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: number | undefined;
    const settle = (outcome: RazorpayCheckoutOutcome) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      resolve(outcome);
    };
    timeoutId = window.setTimeout(() => settle({ dismissed: true }), CHECKOUT_COMPLETION_TIMEOUT_MS);
    const checkout = new window.Razorpay!({
      key: input.key,
      subscription_id: input.subscriptionId,
      name: "Linkar",
      description: "Linkar workspace subscription",
      handler: (result: RazorpayCheckoutSuccess) => settle(result),
      modal: { ondismiss: () => settle({ dismissed: true }) },
    });
    checkout.open();
  });
}
