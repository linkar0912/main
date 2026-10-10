import { createHash } from "node:crypto";
import Redis from "ioredis";
import { logger } from "@/src/lib/logger";
import { isFreshDeletionRequest, parseSignedRequest, type DeletionPayload } from "@/src/lib/meta/data-deletion";

/**
 * Remembers which one-shot messages have already been handled so a replayed
 * copy is ignored. Backed by Redis (SET NX PX) when configured, with an
 * in-process fallback for single-instance and test deployments.
 */
export class ReplayGuard {
  private readonly redis?: Redis;
  private readonly seen = new Map<string, number>();

  constructor(
    redisUrl: string | undefined,
    private readonly namespace: string,
    private readonly ttlMs: number,
  ) {
    this.redis = redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3_000 }) : undefined;
  }

  /** True the first time `key` is claimed within the TTL, false for a replay. */
  async claim(key: string): Promise<boolean> {
    if (this.redis) {
      try {
        return (await this.redis.set(`linkar:replay:${this.namespace}:${key}`, "1", "PX", this.ttlMs, "NX")) === "OK";
      } catch (error) {
        logger.warn("Replay guard Redis write failed; using in-process fallback", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const now = Date.now();
    for (const [candidate, expiresAt] of this.seen) if (expiresAt <= now) this.seen.delete(candidate);
    if (this.seen.has(key)) return false;
    this.seen.set(key, now + this.ttlMs);
    return true;
  }

  /** Forgets a claim so a retry can be processed after a failure. */
  async release(key: string): Promise<void> {
    this.seen.delete(key);
    if (!this.redis) return;
    await this.redis.del(`linkar:replay:${this.namespace}:${key}`).catch(() => undefined);
  }
}

// Long enough to outlive the issued_at freshness window, so a replay is
// rejected either as a duplicate or as stale.
export const SIGNED_CALLBACK_REPLAY_TTL_MS = 25 * 60 * 60 * 1_000;

export type ScreenedSignedCallback =
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "duplicate"; payload: DeletionPayload; key: string }
  | { status: "fresh"; payload: DeletionPayload; key: string };

/**
 * Verifies a Meta signed_request callback and rejects stale or replayed
 * deliveries: the same issued_at window data-deletion enforces, plus a dedupe
 * on the hash of the exact signed request.
 */
export async function screenSignedCallback(
  signedRequest: string,
  appSecret: string,
  guard: ReplayGuard,
  now = Date.now(),
): Promise<ScreenedSignedCallback> {
  const payload = parseSignedRequest(signedRequest, appSecret);
  if (!payload) return { status: "invalid" };
  if (!isFreshDeletionRequest(payload, now)) return { status: "expired" };
  const key = createHash("sha256").update(signedRequest).digest("hex");
  return (await guard.claim(key)) ? { status: "fresh", payload, key } : { status: "duplicate", payload, key };
}
