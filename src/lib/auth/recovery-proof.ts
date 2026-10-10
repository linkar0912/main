import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof that this browser just verified a password-recovery link.
 *
 * /api/auth/reset-password used to accept any signed-in session, so a stolen
 * or unattended session could silently change the password and lock the owner
 * out. /auth/confirm now sets this short-lived cookie, bound to the user id,
 * when it verifies a `recovery` token; the reset endpoint requires it.
 */
export const RECOVERY_PROOF_COOKIE = "linkar_recovery_proof";
export const RECOVERY_PROOF_TTL_SECONDS = 15 * 60;

function sign(payload: string, secret: string): string {
  // Domain-separated from every other use of the session secret.
  return createHmac("sha256", secret).update(`recovery-proof\0${payload}`).digest("base64url");
}

export function createRecoveryProof(userId: string, secret: string, now = new Date()): string {
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: now.getTime() + RECOVERY_PROOF_TTL_SECONDS * 1_000,
  })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the user id the proof was issued to, or null if invalid/expired. */
export function readRecoveryProof(value: string | undefined | null, secret: string, now = new Date()): string | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown };
    if (typeof decoded.sub !== "string" || !decoded.sub) return null;
    if (typeof decoded.exp !== "number" || decoded.exp <= now.getTime()) return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

export function recoveryProofCookieOptions(appUrl: string) {
  return {
    httpOnly: true,
    secure: appUrl.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: RECOVERY_PROOF_TTL_SECONDS,
  };
}
