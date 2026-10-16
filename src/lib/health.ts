import { createHash, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "./env";

type DependencyState = "ok" | "not_configured" | "error";
type IntegrationState = "configured" | "not_configured";
type CapabilityState = "enabled" | "disabled";
type HealthChecker = () => Promise<void>;

export type WorkerHeartbeat = { at: number; release: string | null };
type WorkerHeartbeatState = "ok" | "stale" | "not_configured" | "error";

export type HealthCheckers = {
  database?: HealthChecker;
  redis?: HealthChecker;
  /**
   * Reads the worker's last heartbeat. Only the web health route passes one:
   * the worker's own health server must not judge itself by its heartbeat.
   */
  workerHeartbeat?: () => Promise<WorkerHeartbeat | null>;
};

/**
 * The worker writes this key (see startWorkerHeartbeat in worker-health.ts)
 * with a TTL, so a stopped or wedged worker disappears from Redis on its own.
 */
export const WORKER_HEARTBEAT_KEY = "linkar:worker:heartbeat";
export const WORKER_HEARTBEAT_INTERVAL_MS = 30_000;
/** Three missed beats. Also the key's TTL. */
export const WORKER_HEARTBEAT_STALE_MS = 90_000;

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
  capabilities: {
    followGatedCampaigns: CapabilityState;
  };
  /**
   * Present only when a heartbeat reader was supplied. A stale worker turns
   * `status` "degraded" (so monitoring alerts) but not the web container's
   * HTTP verdict - see isWebServing.
   */
  worker?: {
    heartbeat: WorkerHeartbeatState;
    release: string | null;
  };
};

/**
 * Deadlines for each probe. Without one, /api/health could hang past every
 * caller's timeout: the database probe shares Prisma's pool with user traffic
 * (10 s default pool_timeout), and a connected but silent Valkey never
 * answers. The probes run in parallel, so the whole check answers within the
 * longest deadline.
 *
 * The database gets the longer one because a slow database is not a down
 * one. A `SELECT 1` from this host to the Singapore database already takes
 * about 0.9 to 1.2 s at idle, before a cold connection or any pool wait.
 * /api/health turns "error" into a 503, which Dokploy's service healthcheck
 * and the production monitor read, so a tight deadline would report a slow but
 * working database as an outage. 5 s still answers inside the release
 * script's `--max-time 10` and the monitor's 10 s timeout.
 */
export const HEALTH_DATABASE_PROBE_TIMEOUT_MS = 5_000;
/** Redis and the worker heartbeat read are one round trip to a local Valkey. */
export const HEALTH_REDIS_PROBE_TIMEOUT_MS = 2_000;
/** Below the Redis probe deadline, so the client gives up on its own first. */
const HEALTH_REDIS_COMMAND_TIMEOUT_MS = 1_500;

class HealthProbeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Health probe did not answer within ${timeoutMs} ms`);
    this.name = "HealthProbeTimeoutError";
  }
}

/**
 * Settles with `probe`, or rejects once the deadline passes. A probe that
 * answers late is abandoned, not cancelled; Promise.race keeps its eventual
 * rejection handled.
 */
async function withDeadline<T>(probe: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(probe),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HealthProbeTimeoutError(timeoutMs)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkDatabase(): Promise<void> {
  const { prisma } = await import("./prisma");
  await prisma.$queryRaw`SELECT 1`;
}

const globalForHealth = globalThis as unknown as {
  linkarHealthRedis?: import("ioredis").default;
  linkarHealthRedisUrl?: string;
  linkarHealthRedisPending?: Promise<import("ioredis").default>;
};

/**
 * The shared health-probe Redis connection. Health probes run repeatedly.
 * Reconnecting to Valkey on every probe pays the TCP/TLS handshake each time
 * and amplifies load during an incident.
 */
export async function getHealthRedis(redisUrl: string): Promise<import("ioredis").default> {
  if (globalForHealth.linkarHealthRedisUrl !== redisUrl) {
    globalForHealth.linkarHealthRedis?.disconnect();
    globalForHealth.linkarHealthRedis = undefined;
    globalForHealth.linkarHealthRedisPending = undefined;
    globalForHealth.linkarHealthRedisUrl = redisUrl;
  }
  if (!globalForHealth.linkarHealthRedis && !globalForHealth.linkarHealthRedisPending) {
    globalForHealth.linkarHealthRedisPending = import("ioredis").then(({ default: Redis }) => {
      const client = new Redis(redisUrl, {
        // A Valkey that accepts the connection but never replies would
        // otherwise leave every PING and GET pending forever.
        commandTimeout: HEALTH_REDIS_COMMAND_TIMEOUT_MS,
        connectTimeout: 3_000,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      // Failures surface on each probe; the event is handled so ioredis does
      // not also print an unhandled-error warning on every reconnect. (Optional
      // call only because the ioredis double in health.redis.test.ts has no on().)
      client.on?.("error", () => undefined);
      if (globalForHealth.linkarHealthRedisUrl !== redisUrl) client.disconnect();
      return client;
    });
  }
  let client = globalForHealth.linkarHealthRedis;
  if (!client) {
    try {
      client = await globalForHealth.linkarHealthRedisPending!;
    } catch (error) {
      if (globalForHealth.linkarHealthRedisUrl === redisUrl) globalForHealth.linkarHealthRedisPending = undefined;
      throw error;
    }
  }
  if (globalForHealth.linkarHealthRedisUrl === redisUrl) {
    globalForHealth.linkarHealthRedis = client;
    globalForHealth.linkarHealthRedisPending = undefined;
  }
  return client;
}

async function checkRedis(redisUrl: string): Promise<void> {
  await (await getHealthRedis(redisUrl)).ping();
}

export function parseWorkerHeartbeat(raw: string | null): WorkerHeartbeat | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<WorkerHeartbeat>;
    if (typeof value.at !== "number" || !Number.isFinite(value.at)) return null;
    return { at: value.at, release: typeof value.release === "string" && value.release ? value.release : null };
  } catch {
    return null;
  }
}

/** Default reader for the web health route. */
export async function readWorkerHeartbeat(): Promise<WorkerHeartbeat | null> {
  const { redisUrl } = getServerEnv();
  if (!redisUrl) return null;
  const client = await getHealthRedis(redisUrl);
  return parseWorkerHeartbeat(await client.get(WORKER_HEARTBEAT_KEY));
}

async function getWorkerState(
  redisConfigured: boolean,
  read: () => Promise<WorkerHeartbeat | null>,
  now: number,
): Promise<NonNullable<Health["worker"]>> {
  if (!redisConfigured) return { heartbeat: "not_configured", release: null };
  try {
    const beat = await withDeadline(read, HEALTH_REDIS_PROBE_TIMEOUT_MS);
    if (!beat) return { heartbeat: "stale", release: null };
    return { heartbeat: now - beat.at <= WORKER_HEARTBEAT_STALE_MS ? "ok" : "stale", release: beat.release };
  } catch {
    return { heartbeat: "error", release: null };
  }
}

async function getDependencyState(
  configured: boolean,
  checker: HealthChecker,
  timeoutMs: number,
): Promise<DependencyState> {
  if (!configured) return "not_configured";

  try {
    // A probe that does not answer in time is reported like one that failed.
    await withDeadline(checker, timeoutMs);
    return "ok";
  } catch {
    return "error";
  }
}

/**
 * Whether the deployment is wired to real infrastructure. Derived purely from
 * configuration, with no database or Redis I/O, so surfaces that only need the
 * badge (Home's demo banner, Settings' environment card) can read it off the
 * workspace bootstrap instead of calling /api/health - which opens a fresh
 * Redis connection and runs a `SELECT 1` on every single call.
 */
export function getRuntimeMode(): Health["mode"] {
  const { databaseUrl, redisUrl } = getServerEnv();
  return databaseUrl || redisUrl ? "configured" : "demo";
}

function integrationState(appId?: string, appSecret?: string): IntegrationState {
  return appId && appSecret ? "configured" : "not_configured";
}

export async function getHealth(checkers: HealthCheckers = {}): Promise<Health> {
  const { databaseUrl, redisUrl, metaAppId, metaAppSecret, facebookAppId, facebookAppSecret, followGatedCampaignsEnabled } = getServerEnv();
  const [database, redis, worker] = await Promise.all([
    getDependencyState(Boolean(databaseUrl), checkers.database ?? checkDatabase, HEALTH_DATABASE_PROBE_TIMEOUT_MS),
    getDependencyState(Boolean(redisUrl), checkers.redis ?? (() => checkRedis(redisUrl!)), HEALTH_REDIS_PROBE_TIMEOUT_MS),
    checkers.workerHeartbeat
      ? getWorkerState(Boolean(redisUrl), checkers.workerHeartbeat, Date.now())
      : Promise.resolve(undefined),
  ]);
  const dependenciesOk = (database === "not_configured" && redis === "not_configured")
    || (database === "ok" && redis === "ok");
  const workerOk = !worker || worker.heartbeat === "ok" || worker.heartbeat === "not_configured";

  return {
    status: dependenciesOk && workerOk ? "ok" : "degraded",
    mode: databaseUrl || redisUrl ? "configured" : "demo",  // same rule as getRuntimeMode()
    // BUILD_COMMIT is baked into the image and cannot drift from the running code.
    release: process.env.BUILD_COMMIT || null,
    dependencies: { database, redis },
    integrations: {
      instagram: integrationState(metaAppId, metaAppSecret),
      facebook: integrationState(facebookAppId, facebookAppSecret),
    },
    capabilities: {
      followGatedCampaigns: followGatedCampaignsEnabled ? "enabled" : "disabled",
    },
    ...(worker ? { worker } : {}),
  };
}

/**
 * Whether this web container can serve requests: its own database and Redis
 * dependencies. /api/health keys its HTTP status off this, and Dokploy's
 * service healthcheck and the release tooling read that, so a stopped worker
 * must not take the web service down with it. The image's own HEALTHCHECK
 * probes /api/health/live instead, which does no dependency I/O.
 */
export function isWebServing(health: Health): boolean {
  const { database, redis } = health.dependencies;
  return (database === "not_configured" && redis === "not_configured") || (database === "ok" && redis === "ok");
}

export const HEALTH_DETAIL_HEADER = "x-health-token";
const HEALTH_CACHE_MS = 5_000;

const globalForHealthCache = globalThis as unknown as {
  linkarWebHealth?: { expiresAt: number; value: Promise<Health> };
};

/**
 * The public /api/health result, shared for a few seconds. The endpoint is
 * unauthenticated and every call costs a database round trip and two Redis
 * commands, so a burst of probes (or a hostile loop) collapses into one.
 */
export function getCachedWebHealth(
  load: () => Promise<Health> = () => getHealth({ workerHeartbeat: readWorkerHeartbeat }),
  now = Date.now(),
): Promise<Health> {
  const cached = globalForHealthCache.linkarWebHealth;
  if (cached && cached.expiresAt > now) return cached.value;
  const value = load();
  globalForHealthCache.linkarWebHealth = { expiresAt: now + HEALTH_CACHE_MS, value };
  // A thrown health check must not be served from cache for the whole window.
  value.catch(() => {
    if (globalForHealthCache.linkarWebHealth?.value === value) globalForHealthCache.linkarWebHealth = undefined;
  });
  return value;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Dependency, release, integration and worker detail is for operators and the
 * release tooling, which send HEALTH_DETAIL_TOKEN in the x-health-token
 * header. Everyone else gets the status alone. Local development without a
 * configured token keeps the full view.
 */
export function canViewHealthDetail(presented: string | null): boolean {
  const expected = process.env.HEALTH_DETAIL_TOKEN?.trim();
  if (!expected) return process.env.NODE_ENV !== "production";
  if (!presented) return false;
  return timingSafeEqual(digest(presented.trim()), digest(expected));
}
