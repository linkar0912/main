import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type DeletionPayload = { user_id: string };

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function parseSignedRequest(signedRequest: string, appSecret: string): DeletionPayload | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSignature, encodedPayload] = parts;
  if (!encodedPayload || !encodedSignature) return null;

  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  const actual = decodeBase64Url(encodedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8")) as Record<string, unknown>;
    if (payload.algorithm !== "HMAC-SHA256") return null;
    return typeof payload.user_id === "string" && payload.user_id ? { user_id: payload.user_id } : null;
  } catch {
    return null;
  }
}

export function createDeletionConfirmationCode(): string {
  return `replyconnect_delete_${randomBytes(12).toString("hex")}`;
}

export function createDeletionResponse(confirmationCode: string, statusUrl: string) {
  return {
    url: statusUrl,
    confirmation_code: confirmationCode,
  };
}
