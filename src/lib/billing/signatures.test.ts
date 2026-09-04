import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyCheckoutSignature, verifyWebhookSignature } from "./signatures";

function hmac(value: string | Buffer, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

describe("Razorpay signature verification", () => {
  it("accepts checkout signatures over payment_id|subscription_id", () => {
    const secret = "checkout-secret";
    const paymentId = "pay_123";
    const subscriptionId = "sub_456";

    expect(verifyCheckoutSignature({
      paymentId,
      subscriptionId,
      signature: hmac(`${paymentId}|${subscriptionId}`, secret),
      secret,
    })).toBe(true);
  });

  it("rejects a mutated or malformed checkout signature without throwing", () => {
    const secret = "checkout-secret";
    const valid = hmac("pay_123|sub_456", secret);

    expect(verifyCheckoutSignature({
      paymentId: "pay_123",
      subscriptionId: "sub_456",
      signature: `${valid.slice(0, -1)}0`,
      secret,
    })).toBe(false);
    expect(verifyCheckoutSignature({
      paymentId: "pay_123",
      subscriptionId: "sub_456",
      signature: "not-hex",
      secret,
    })).toBe(false);
  });

  it("verifies webhooks against the exact raw bytes", () => {
    const secret = "webhook-secret";
    const rawBody = Buffer.from('{"event":"subscription.activated","amount":19900}');
    const signature = hmac(rawBody, secret);

    expect(verifyWebhookSignature({ rawBody, signature, secret })).toBe(true);
    expect(verifyWebhookSignature({
      rawBody: Buffer.from('{"amount":19900,"event":"subscription.activated"}'),
      signature,
      secret,
    })).toBe(false);
  });
});
