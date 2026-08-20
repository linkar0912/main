import { createHmac } from "node:crypto";
import Redis from "ioredis";
import { createLoginAttemptLimiter } from "./session";

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
    const count = Number(await this.redis.get(`replyconnect:login:${key}`) ?? "0");
    return count < this.maxAttempts;
  }

  async recordFailure(key: string): Promise<void> {
    if (!this.redis) return this.fallback.recordFailure(key);
    await this.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      `replyconnect:login:${key}`,
      String(this.windowMs),
    );
  }

  async reset(key: string): Promise<void> {
    if (!this.redis) return this.fallback.reset(key);
    await this.redis.del(`replyconnect:login:${key}`);
  }
}

export function loginRateLimitKey(secret: string, email: string, clientAddress: string): string {
  return createHmac("sha256", secret).update(`${email.toLowerCase()}\0${clientAddress}`).digest("hex");
}
