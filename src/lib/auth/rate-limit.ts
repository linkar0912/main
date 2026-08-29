import { createHmac } from "node:crypto";
import Redis from "ioredis";

export type LoginAttemptLimiter = {
  isAllowed(key: string, now?: Date): boolean;
  recordFailure(key: string, now?: Date): void;
  reset(key: string): void;
};

function createLoginAttemptLimiter(maxAttempts: number, windowMs: number, maxKeys = 1_000): LoginAttemptLimiter {
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
    const count = Number(await this.redis.get(`linkar:login:${key}`) ?? "0");
    return count < this.maxAttempts;
  }

  async recordFailure(key: string): Promise<void> {
    if (!this.redis) return this.fallback.recordFailure(key);
    await this.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      `linkar:login:${key}`,
      String(this.windowMs),
    );
  }

  async reset(key: string): Promise<void> {
    if (!this.redis) return this.fallback.reset(key);
    await this.redis.del(`linkar:login:${key}`);
  }
}

export function loginRateLimitKey(secret: string, email: string, clientAddress: string): string {
  return createHmac("sha256", secret).update(`${email.toLowerCase()}\0${clientAddress}`).digest("hex");
}
