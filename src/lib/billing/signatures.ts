import { createHmac, timingSafeEqual } from "node:crypto";

type VerifySignatureInput = {
  signature: string;
  secret: string;
};

function verifyHmac(value: string | Buffer, input: VerifySignatureInput): boolean {
  if (!/^[a-fA-F0-9]{64}$/.test(input.signature)) return false;
  const expected = createHmac("sha256", input.secret).update(value).digest();
  const received = Buffer.from(input.signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifyCheckoutSignature(input: VerifySignatureInput & {
  paymentId: string;
  subscriptionId: string;
}): boolean {
  return verifyHmac(`${input.paymentId}|${input.subscriptionId}`, input);
}

export function verifyWebhookSignature(input: VerifySignatureInput & {
  rawBody: Buffer;
}): boolean {
  return verifyHmac(input.rawBody, input);
}
