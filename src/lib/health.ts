import { getServerEnv } from "./env";

type DependencyState = "ok" | "not_configured" | "error";
type IntegrationState = "configured" | "not_configured";
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
  /**
   * Whether each channel has an app id *and* an app secret. `mode` only tracks
   * database/redis, so it reports "configured" for a deployment that cannot
   * talk to Meta at all - which is exactly the gap that made the App Review
   * readiness check meaningless. Reported, never folded into `status`: the web
   * container healthcheck fails on a non-2xx /api/health, so an unconfigured
   * channel must not be able to take the service down.
   */
  integrations: {
    instagram: IntegrationState;
    facebook: IntegrationState;
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

function integrationState(appId?: string, appSecret?: string): IntegrationState {
  return appId && appSecret ? "configured" : "not_configured";
}

export async function getHealth(checkers: HealthCheckers = {}): Promise<Health> {
  const { databaseUrl, redisUrl, metaAppId, metaAppSecret, facebookAppId, facebookAppSecret } = getServerEnv();
  const [database, redis] = await Promise.all([
    getDependencyState(Boolean(databaseUrl), checkers.database ?? checkDatabase),
    getDependencyState(Boolean(redisUrl), checkers.redis ?? (() => checkRedis(redisUrl!))),
  ]);

  return {
    status: database === "not_configured" && redis === "not_configured"
      ? "ok"
      : database === "ok" && redis === "ok"
        ? "ok"
        : "degraded",
    mode: databaseUrl || redisUrl ? "configured" : "demo",
    // BUILD_COMMIT is baked into the image at build time and is authoritative.
    // SOURCE_COMMIT is supplied by the operator and has gone stale in
    // production before, so it is only a fallback for images built without it.
    release: process.env.BUILD_COMMIT || process.env.SOURCE_COMMIT || null,
    dependencies: { database, redis },
    integrations: {
      instagram: integrationState(metaAppId, metaAppSecret),
      facebook: integrationState(facebookAppId, facebookAppSecret),
    },
  };
}
