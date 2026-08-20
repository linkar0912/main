import { getServerEnv } from "./env";

type DependencyState = "ok" | "not_configured" | "error";
type HealthChecker = () => Promise<void>;

export type HealthCheckers = {
  database?: HealthChecker;
  redis?: HealthChecker;
};

export type Health = {
  status: "ok" | "degraded";
  mode: "demo" | "configured";
  release: string | null;
  dependencies: {
    database: DependencyState;
    redis: DependencyState;
  };
};

async function checkDatabase(): Promise<void> {
  const { prisma } = await import("./prisma");
  await prisma.$queryRaw`SELECT 1`;
}

async function checkRedis(redisUrl: string): Promise<void> {
  const { default: Redis } = await import("ioredis");
  const redis = new Redis(redisUrl, { connectTimeout: 5_000, lazyConnect: true, maxRetriesPerRequest: 1 });

  try {
    await redis.ping();
  } finally {
    redis.disconnect();
  }
}

async function getDependencyState(configured: boolean, checker: HealthChecker): Promise<DependencyState> {
  if (!configured) return "not_configured";

  try {
    await checker();
    return "ok";
  } catch {
    return "error";
  }
}

export async function getHealth(checkers: HealthCheckers = {}): Promise<Health> {
  const { databaseUrl, redisUrl } = getServerEnv();
  const [database, redis] = await Promise.all([
    getDependencyState(Boolean(databaseUrl), checkers.database ?? checkDatabase),
    getDependencyState(Boolean(redisUrl), checkers.redis ?? (() => checkRedis(redisUrl!))),
  ]);

  return {
    status: database === "error" || redis === "error" ? "degraded" : "ok",
    mode: databaseUrl || redisUrl ? "configured" : "demo",
    release: process.env.SOURCE_COMMIT || null,
    dependencies: { database, redis },
  };
}
