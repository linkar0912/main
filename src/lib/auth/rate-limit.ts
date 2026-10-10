import { createHmac } from "node:crypto";
import Redis from "ioredis";
import { logger } from "@/src/lib/logger";

export type LoginAttemptLimiter = {
  isAllowed(key: string, now?: Date): boolean;
  recordFailure(key: string, now?: Date): void;
  consume(key: string, now?: Date): boolean;
  reset(key: string): void;
};

// INCR first, then compare: the counter is bumped atomically before the
// caller does any work, so N concurrent requests can never all observe the
// same pre-increment count and slip past the limit together. The expiry is
// set only on the first hit, so the window is fixed from the first attempt.
const CONSUME_SCRIPT =
  "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n";

function createLoginAttemptLimiter(maxAttempts: number, windowMs: number, maxKeys = 1_000): LoginAttemptLimiter {
  const failures = new Map<string, number[]>();
  const active = (key: string, now: Date) => {
    const cutoff = now.getTime() - windowMs;
    const values = (failures.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (values.length) failures.set(key, values);
    else failures.delete(key);
    return values;
  };
  const record = (key: string, now: Date) => {
    if (!failures.has(key) && failures.size >= maxKeys) {
      for (const [candidate, timestamps] of failures) {
        if (timestamps.every((timestamp) => timestamp <= now.getTime() - windowMs)) failures.delete(candidate);
      }
      if (failures.size >= maxKeys) failures.delete(failures.keys().next().value as string);
    }
    const values = [...active(key, now), now.getTime()];
    failures.set(key, values);
    return values.length;
  };
  return {
    isAllowed(key, now = new Date()) {
      return active(key, now).length < maxAttempts;
    },
    recordFailure(key, now = new Date()) {
      record(key, now);
    },
    consume(key, now = new Date()) {
      return record(key, now) <= maxAttempts;
    },
    reset(key) {
      failures.delete(key);
    },
  };
}

export class LoginRateLimitStore {
  private readonly fallback;
  private readonly redis?: Redis;

  constructor(
    redisUrl: string | undefined,
    private readonly maxAttempts = 5,
    private readonly windowMs = 15 * 60 * 1_000,
  ) {
    this.fallback = createLoginAttemptLimiter(maxAttempts, windowMs);
    this.redis = redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3_000 }) : undefined;
  }

  async isAllowed(key: string): Promise<boolean> {
    if (!this.redis) return this.fallback.isAllowed(key);
    try {
      const count = Number(await this.redis.get(`linkar:login:${key}`) ?? "0");
      return count < this.maxAttempts;
    } catch (error) {
      logger.warn("Rate limiter Redis read failed; using in-process fallback", {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.fallback.isAllowed(key);
    }
  }

  /**
   * Atomically records one attempt and reports whether it is still within the
   * limit. Prefer this over isAllowed()+recordFailure(), which is a
   * check-then-act race under concurrency.
   */
  async consume(key: string): Promise<boolean> {
    if (!this.redis) return this.fallback.consume(key);
    try {
      const count = Number(await this.redis.eval(CONSUME_SCRIPT, 1, `linkar:login:${key}`, String(this.windowMs)));
      return count <= this.maxAttempts;
    } catch (error) {
      logger.warn("Rate limiter Redis write failed; using in-process fallback", {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.fallback.consume(key);
    }
  }

  async recordFailure(key: string): Promise<void> {
    if (!this.redis) return this.fallback.recordFailure(key);
    try {
      await this.redis.eval(CONSUME_SCRIPT, 1, `linkar:login:${key}`, String(this.windowMs));
    } catch (error) {
      logger.warn("Rate limiter Redis write failed; using in-process fallback", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.fallback.recordFailure(key);
    }
  }

  async reset(key: string): Promise<void> {
    if (!this.redis) return this.fallback.reset(key);
    try {
      await this.redis.del(`linkar:login:${key}`);
    } catch (error) {
      logger.warn("Rate limiter Redis reset failed; using in-process fallback", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.fallback.reset(key);
    }
  }
}

export function loginRateLimitKey(secret: string, email: string, clientAddress: string): string {
  return createHmac("sha256", secret).update(`${email.toLowerCase()}\0${clientAddress}`).digest("hex");
}

/**
 * Per-network key for a cap that applies across every email. Returns null when
 * the client address is unknown (no trusted proxy configured): every visitor
 * would then share one bucket and one attacker could lock out everyone.
 */
export function networkRateLimitKey(secret: string, scope: string, clientAddress: string): string | null {
  if (!clientAddress || clientAddress === "unknown") return null;
  return createHmac("sha256", secret).update(`network\0${scope}\0${clientAddress}`).digest("hex");
}
