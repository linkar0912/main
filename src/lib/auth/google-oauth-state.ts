import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "linkar_google_oauth_state";
/**
 * How long a Google sign-in may take, start to callback: long enough for an
 * account chooser, a 2-step check or a new Google account. The start route's
 * state cookie lasts as long (1800 s).
 */
export const OAUTH_STATE_TTL_MS = 30 * 60 * 1_000;

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

/** The payload of a state whose signature verifies, expired or not; null otherwise. */
function verifiedPayload(value: string, secret: string): Partial<StatePayload> | null {
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
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded === "object" && decoded !== null ? decoded as Partial<StatePayload> : null;
  } catch {
    return null;
  }
}

export function readGoogleOAuthState(
  value: string,
  secret: string,
  now = new Date(),
): { next: string; invite?: string; nonce: string } | null {
  const decoded = verifiedPayload(value, secret);
  if (
    !decoded
    || typeof decoded.next !== "string" || !decoded.next
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
}

/**
 * next and invite from any state this app signed, ignoring its expiry and
 * whether it matches the cookie. For error redirects only, so a person who
 * comes back too late, or in another tab, keeps their invitation; it never
 * lets a sign-in through. readGoogleOAuthState stays the only reader for that.
 */
export function readGoogleOAuthStateContext(
  value: string,
  secret: string,
): { next: string; invite?: string } | null {
  const decoded = verifiedPayload(value, secret);
  if (!decoded || typeof decoded.next !== "string" || !decoded.next) return null;
  return {
    next: decoded.next,
    ...(typeof decoded.invite === "string" && decoded.invite ? { invite: decoded.invite } : {}),
  };
}
