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

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutLoad) return checkoutLoad;
  checkoutLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      checkoutLoad = undefined;
      reject(new Error("checkout_unavailable"));
    };
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
    const checkout = new window.Razorpay!({
      key: input.key,
      subscription_id: input.subscriptionId,
      name: "Linkar",
      description: "Linkar workspace subscription",
      handler: (result: RazorpayCheckoutSuccess) => resolve(result),
      modal: { ondismiss: () => resolve({ dismissed: true }) },
    });
    checkout.open();
  });
}
