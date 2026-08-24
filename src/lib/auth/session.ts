import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { getServerEnv } from "../env";
import { createId } from "../id";
import { getRepository } from "../repository-provider";
import type { AutomationRepository } from "../repository";

// Async scrypt keeps the Node event loop free while hashing (~50–100ms of CPU work);
// the login/signup routes serve other requests concurrently.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = "linkar_session";
const PRODUCTION_SESSION_COOKIE = "__Host-linkar_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;

export type AppSession = {
  userId: string;
  workspaceId: string;
  // Per-session identifier, used to revoke a single session ("log out this device").
  sid?: string;
  // User token version at issue time; a mismatch means every session was invalidated.
  ver?: number;
};

type StoredSession = AppSession & {
  expiresAt: number;
};

export type LoginAttemptLimiter = {
  isAllowed(key: string, now?: Date): boolean;
  recordFailure(key: string, now?: Date): void;
  reset(key: string): void;
};

export function createLoginAttemptLimiter(maxAttempts: number, windowMs: number, maxKeys = 1_000): LoginAttemptLimiter {
  const failures = new Map<string, number[]>();
  const active = (key: string, now: Date) => {
    const cutoff = now.getTime() - windowMs;
    const values = (failures.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (values.length) failures.set(key, values);
    else failures.delete(key);
    return values;
  };
  return {
    isAllowed(key, now = new Date()) {
      return active(key, now).length < maxAttempts;
    },
    recordFailure(key, now = new Date()) {
      if (!failures.has(key) && failures.size >= maxKeys) {
        for (const [candidate, timestamps] of failures) {
          if (timestamps.every((timestamp) => timestamp <= now.getTime() - windowMs)) failures.delete(candidate);
        }
        if (failures.size >= maxKeys) failures.delete(failures.keys().next().value as string);
      }
      failures.set(key, [...active(key, now), now.getTime()]);
    },
    reset(key) {
      failures.delete(key);
    },
  };
}

function signature(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
): Promise<string> {
  const digest = (await scrypt(password, Buffer.from(salt, "hex"), 64)).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;

  try {
    const expected = Buffer.from(expectedHex, "hex");
    if (expected.length === 0) return false;
    const actual = await scrypt(password, Buffer.from(salt, "hex"), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSessionToken(
  session: AppSession,
  secret: string,
  now = new Date(),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId: session.userId,
      workspaceId: session.workspaceId,
      sid: session.sid ?? createId("session"),
      ver: session.ver ?? 0,
      expiresAt: now.getTime() + SESSION_TTL_MS,
    } satisfies StoredSession),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function readSessionToken(token: string | undefined, secret: string, now = new Date()): AppSession | null {
  if (!token || secret.length < 32) return null;
  const [payload, encodedSignature] = token.split(".");
  if (!payload || !encodedSignature) return null;

  try {
    // Compare the canonical base64url encoding rather than decoded bytes: base64
    // decoders ignore the trailing padding bits, so several mutated final
    // characters would otherwise decode to the same signature and pass.
    const expectedEncoded = signature(payload, secret).toString("base64url");
    if (
      encodedSignature.length !== expectedEncoded.length
      || !timingSafeEqual(Buffer.from(encodedSignature), Buffer.from(expectedEncoded))
    ) {
      return null;
    }

    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<StoredSession>;
    if (
      typeof value.userId !== "string" ||
      !value.userId ||
      typeof value.workspaceId !== "string" ||
      !value.workspaceId ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= now.getTime()
    ) return null;

    return {
      userId: value.userId,
      workspaceId: value.workspaceId,
      sid: typeof value.sid === "string" && value.sid ? value.sid : undefined,
      ver: typeof value.ver === "number" ? value.ver : undefined,
    };
  } catch {
    return null;
  }
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)
    ?.slice(1)
    .join("=");
}

export function getSessionFromRequest(request: Request): AppSession | null {
  const env = getServerEnv();
  return readSessionToken(
    readCookie(request.headers.get("cookie"), sessionCookieName(env.appUrl)),
    env.authSessionSecret,
  );
}

type SessionStateRepository = Pick<AutomationRepository, "isSessionRevoked" | "getUserTokenVersion">;

/** Validate a parsed session against server-side logout and token-version state. */
export async function validateSessionState(
  session: AppSession | null,
  repository: SessionStateRepository,
): Promise<AppSession | null> {
  if (!session?.sid || session.ver === undefined) return null;
  if (await repository.isSessionRevoked(session.sid)) return null;
  const currentVersion = await repository.getUserTokenVersion(session.userId);
  if (currentVersion === null || session.ver !== currentVersion) return null;
  return session;
}

// Full validation: signature + expiry (readSessionToken) plus server-side
// revocation state - single-session denylist and per-user token version.
// Routes that mutate state should use this instead of getSessionFromRequest.
export async function getValidatedSession(request: Request): Promise<AppSession | null> {
  const session = getSessionFromRequest(request);
  return validateSessionState(session, getRepository());
}

export function safeNextPath(value: string | null | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f]/.test(value)
    ? value
    : "/";
}

export function sessionCookieName(appUrl: string): string {
  return appUrl.startsWith("https://") ? PRODUCTION_SESSION_COOKIE : SESSION_COOKIE;
}
