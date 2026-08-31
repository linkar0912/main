import { createHash, randomBytes } from "node:crypto";

import Redis from "ioredis";

import { getServerEnv } from "@/src/lib/env";

const CHALLENGE_TTL_SECONDS = 600;
const KEY_PREFIX = "linkar:admin-challenge:";

export type AdminChallengeBinding = {
  userId: string;
  sessionId: string;
  action: string;
  targetType: string;
  targetId: string;
  expectedVersion?: string;
  confirmation: string;
};

export type AdminChallengeRecord = Omit<AdminChallengeBinding, "confirmation"> & {
  confirmationHash: string;
};

export type AdminChallengeConsumeResult = "consumed" | "missing" | "mismatch";

export interface AdminChallengeStore {
  put(tokenHash: string, record: AdminChallengeRecord, ttlSeconds: number): Promise<boolean>;
  consume(tokenHash: string, expected: AdminChallengeRecord): Promise<AdminChallengeConsumeResult>;
}

type RedisChallengeClient = Pick<Redis, "set" | "eval">;

const COMPARE_AND_DELETE = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
if current ~= ARGV[1] then return -1 end
redis.call('DEL', KEYS[1])
return 1
`;

export class RedisAdminChallengeStore implements AdminChallengeStore {
  constructor(private readonly redis: RedisChallengeClient) {}

  async put(tokenHash: string, record: AdminChallengeRecord, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(
      `${KEY_PREFIX}${tokenHash}`,
      JSON.stringify(record),
      "EX",
      ttlSeconds,
      "NX",
    );
    return result === "OK";
  }

  async consume(tokenHash: string, expected: AdminChallengeRecord): Promise<AdminChallengeConsumeResult> {
    const result = Number(
      await this.redis.eval(
        COMPARE_AND_DELETE,
        1,
        `${KEY_PREFIX}${tokenHash}`,
        JSON.stringify(expected),
      ),
    );
    if (result === 1) return "consumed";
    if (result === -1) return "mismatch";
    return "missing";
  }
}

export type AdminChallengeErrorCode =
  | "challenge_missing"
  | "challenge_mismatch"
  | "challenge_unavailable";

export class AdminChallengeError extends Error {
  constructor(
    public readonly status: 403 | 409 | 503,
    public readonly code: AdminChallengeErrorCode,
  ) {
    super(code);
    this.name = "AdminChallengeError";
  }
}

type ChallengeDependencies = {
  store?: AdminChallengeStore;
  now?: () => Date;
  randomToken?: () => string;
  ttlSeconds?: number;
};

let defaultStore: AdminChallengeStore | undefined;

function challengeStore(): AdminChallengeStore {
  if (defaultStore) return defaultStore;
  const redisUrl = getServerEnv().redisUrl;
  if (!redisUrl) throw new AdminChallengeError(503, "challenge_unavailable");
  defaultStore = new RedisAdminChallengeStore(
    new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3_000 }),
  );
  return defaultStore;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function recordFor(binding: AdminChallengeBinding): AdminChallengeRecord {
  return {
    userId: binding.userId,
    sessionId: binding.sessionId,
    action: binding.action,
    targetType: binding.targetType,
    targetId: binding.targetId,
    expectedVersion: binding.expectedVersion,
    confirmationHash: sha256(binding.confirmation),
  };
}

export async function createAdminChallenge(
  binding: AdminChallengeBinding,
  dependencies: ChallengeDependencies = {},
): Promise<{ token: string; expiresAt: string }> {
  const store = dependencies.store ?? challengeStore();
  const token = dependencies.randomToken?.() ?? randomBytes(32).toString("base64url");
  const ttlSeconds = dependencies.ttlSeconds ?? getServerEnv().adminChallengeTtlSeconds ?? CHALLENGE_TTL_SECONDS;
  const inserted = await store.put(sha256(token), recordFor(binding), ttlSeconds);
  if (!inserted) throw new AdminChallengeError(503, "challenge_unavailable");

  const now = dependencies.now?.() ?? new Date();
  return {
    token,
    expiresAt: new Date(now.getTime() + ttlSeconds * 1_000).toISOString(),
  };
}

export async function consumeAdminChallenge(
  input: AdminChallengeBinding & { token: string },
  dependencies: Pick<ChallengeDependencies, "store"> = {},
): Promise<void> {
  const store = dependencies.store ?? challengeStore();
  const result = await store.consume(sha256(input.token), recordFor(input));
  if (result === "consumed") return;
  if (result === "mismatch") throw new AdminChallengeError(403, "challenge_mismatch");
  throw new AdminChallengeError(409, "challenge_missing");
}
