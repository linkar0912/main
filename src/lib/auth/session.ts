import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { getServerEnv } from "../env";

export const OWNER_SESSION_COOKIE = "replyconnect_owner_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;

export type OwnerSession = {
  email: string;
  workspaceId: string;
};

type StoredSession = OwnerSession & {
  expiresAt: number;
};

export type OwnerAuthConfig = OwnerSession & {
  passwordHash: string;
  sessionSecret: string;
};

export type LoginAttemptLimiter = {
  isAllowed(key: string, now?: Date): boolean;
  recordFailure(key: string, now?: Date): void;
  reset(key: string): void;
};

export function createLoginAttemptLimiter(maxAttempts: number, windowMs: number): LoginAttemptLimiter {
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

export function hashOwnerPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const digest = scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

export function verifyOwnerPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;

  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = scryptSync(password, Buffer.from(salt, "hex"), expected.length);
    return expected.length > 0 && actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createOwnerSessionToken(
  session: OwnerSession,
  secret: string,
  now = new Date(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ ...session, expiresAt: now.getTime() + SESSION_TTL_MS } satisfies StoredSession),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function readOwnerSession(token: string | undefined, secret: string, now = new Date()): OwnerSession | null {
  if (!token || secret.length < 32) return null;
  const [payload, encodedSignature] = token.split(".");
  if (!payload || !encodedSignature) return null;

  try {
    const expected = signature(payload, secret);
    const actual = Buffer.from(encodedSignature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<StoredSession>;
    if (
      typeof value.email !== "string" ||
      !value.email ||
      typeof value.workspaceId !== "string" ||
      !value.workspaceId ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= now.getTime()
    ) return null;

    return { email: value.email, workspaceId: value.workspaceId };
  } catch {
    return null;
  }
}

export function getOwnerAuthConfig(): OwnerAuthConfig | null {
  const env = getServerEnv();
  if (
    !env.ownerEmail ||
    !env.ownerPasswordHash ||
    !/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/i.test(env.ownerPasswordHash) ||
    !env.ownerSessionSecret ||
    env.ownerSessionSecret.length < 32 ||
    !env.ownerWorkspaceId
  ) return null;

  return {
    email: env.ownerEmail.toLowerCase(),
    workspaceId: env.ownerWorkspaceId,
    passwordHash: env.ownerPasswordHash,
    sessionSecret: env.ownerSessionSecret,
  };
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)
    ?.slice(1)
    .join("=");
}

export function getOwnerSessionFromRequest(request: Request): OwnerSession | null {
  const config = getOwnerAuthConfig();
  if (!config) return null;
  return readOwnerSession(readCookie(request.headers.get("cookie"), OWNER_SESSION_COOKIE), config.sessionSecret);
}

export function safeNextPath(value: string | null | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f]/.test(value)
    ? value
    : "/";
}

export function getRequestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim() || requestUrl.host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "https" || forwardedProtocol === "http"
    ? forwardedProtocol
    : requestUrl.protocol.slice(0, -1);
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return requestUrl.origin;
  }
}
