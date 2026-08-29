import { createHash, randomBytes } from "node:crypto";

// Raw tokens are 32 random bytes, base64url - shown once in a link. Only the
// SHA-256 hash is persisted, so a database leak cannot be replayed as a link.
// Used for team invitations; password-reset and email-verify tokens are now
// issued and verified by Supabase Auth instead.
export function createRawToken(): string {
    return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
}
