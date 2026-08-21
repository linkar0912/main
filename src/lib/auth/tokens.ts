import { createHash, randomBytes } from "node:crypto";
import { getRepository } from "../repository-provider";
import type { AuthTokenType } from "../repository";

// Raw tokens are 32 random bytes, base64url — shown once in a link. Only the
// SHA-256 hash is persisted, so a database leak cannot be replayed as a link.
export function createRawToken(): string {
    return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
}

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1_000; // 1 hour
export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1_000; // 24 hours

export async function issueAuthToken(userId: string, type: AuthTokenType): Promise<string> {
    const raw = createRawToken();
    const ttl = type === "PASSWORD_RESET" ? PASSWORD_RESET_TTL_MS : EMAIL_VERIFY_TTL_MS;
    await getRepository().createAuthToken({
        userId,
        type,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + ttl).toISOString(),
    });
    return raw;
}

export async function consumeAuthToken(raw: string, type: AuthTokenType): Promise<{ userId: string } | null> {
    if (!raw) return null;
    const record = await getRepository().consumeAuthToken(hashToken(raw), type, new Date().toISOString());
    return record ? { userId: record.userId } : null;
}