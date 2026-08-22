import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const META_OAUTH_STATE_COOKIE = "replyconnect_meta_oauth_state";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;

type OAuthStatePayload = {
  workspaceId: string;
  expiresAt: number;
  nonce: string;
};

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createOAuthState(workspaceId: string, secret: string, now = new Date()): string {
  const payload = Buffer.from(JSON.stringify({
    workspaceId,
    expiresAt: now.getTime() + OAUTH_STATE_TTL_MS,
    nonce: randomBytes(16).toString("hex"),
  } satisfies OAuthStatePayload)).toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

export function readOAuthState(value: string, secret: string, now = new Date()): { workspaceId: string } | null {
  const [payload, encodedSignature] = value.split(".");
  if (!payload || !encodedSignature || secret.length < 32) return null;

  try {
    // Compare the canonical base64url encoding rather than decoded bytes: the
    // 32-byte signature encodes to 43 characters whose last character carries four
    // padding bits, so several mutated final characters decode to the same buffer
    // and would otherwise verify. readSessionToken hardens the same way.
    const expectedEncoded = sign(payload, secret).toString("base64url");
    if (
      encodedSignature.length !== expectedEncoded.length
      || !timingSafeEqual(Buffer.from(encodedSignature), Buffer.from(expectedEncoded))
    ) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<OAuthStatePayload>;
    if (typeof decoded.workspaceId !== "string" || !decoded.workspaceId || typeof decoded.expiresAt !== "number" || decoded.expiresAt <= now.getTime()) return null;
    return { workspaceId: decoded.workspaceId };
  } catch {
    return null;
  }
}
