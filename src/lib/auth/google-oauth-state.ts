import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "linkar_google_oauth_state";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;

type StatePayload = {
  next: string;
  invite?: string;
  expiresAt: number;
  nonce: string;
};

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

/**
 * Signs `next`/`invite` into the OAuth `state` param (Google's redirect_uri
 * must exactly match a pre-registered value, so it can't carry dynamic query
 * params itself) and returns the same random nonce embedded in the payload -
 * callers send it to Google as the OIDC `nonce` param and later hand it to
 * Supabase's signInWithIdToken to verify against the returned ID token.
 */
export function createGoogleOAuthState(
  params: { next: string; invite?: string },
  secret: string,
  now = new Date(),
): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const payload = Buffer.from(JSON.stringify({
    next: params.next,
    ...(params.invite ? { invite: params.invite } : {}),
    expiresAt: now.getTime() + OAUTH_STATE_TTL_MS,
    nonce,
  } satisfies StatePayload)).toString("base64url");
  return { state: `${payload}.${sign(payload, secret).toString("base64url")}`, nonce };
}

export function readGoogleOAuthState(
  value: string,
  secret: string,
  now = new Date(),
): { next: string; invite?: string; nonce: string } | null {
  const [payload, encodedSignature] = value.split(".");
  if (!payload || !encodedSignature || secret.length < 32) return null;

  try {
    const expectedEncoded = sign(payload, secret).toString("base64url");
    if (
      encodedSignature.length !== expectedEncoded.length
      || !timingSafeEqual(Buffer.from(encodedSignature), Buffer.from(expectedEncoded))
    ) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<StatePayload>;
    if (
      typeof decoded.next !== "string" || !decoded.next
      || typeof decoded.nonce !== "string" || !decoded.nonce
      || typeof decoded.expiresAt !== "number" || decoded.expiresAt <= now.getTime()
    ) {
      return null;
    }
    return {
      next: decoded.next,
      nonce: decoded.nonce,
      ...(typeof decoded.invite === "string" && decoded.invite ? { invite: decoded.invite } : {}),
    };
  } catch {
    return null;
  }
}
