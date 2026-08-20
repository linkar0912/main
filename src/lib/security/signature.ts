import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const receivedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const received = Buffer.from(receivedHex, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
