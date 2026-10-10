import { createServer, type Server } from "node:http";
import { getServerEnv } from "./env";
import {
  getHealth,
  getHealthRedis,
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_STALE_MS,
  type HealthCheckers,
  type WorkerHeartbeat,
} from "./health";

export const DEFAULT_WORKER_HEALTH_PORT = 3001;
const WORKER_READY_TIMEOUT_MS = 1_500;

async function processingReady(check: () => boolean | Promise<boolean>): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(check).then(Boolean).catch(() => false),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), WORKER_READY_TIMEOUT_MS);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export type WorkerHeartbeatWriter = (beat: WorkerHeartbeat) => Promise<void>;

/** Writes the heartbeat with a TTL so a dead worker expires on its own. */
async function writeHeartbeatToRedis(beat: WorkerHeartbeat): Promise<void> {
  const { redisUrl } = getServerEnv();
  if (!redisUrl) return;
  const client = await getHealthRedis(redisUrl);
  await client.set(WORKER_HEARTBEAT_KEY, JSON.stringify(beat), "PX", WORKER_HEARTBEAT_STALE_MS);
}

/**
 * Beats only while BullMQ is actually consuming, so the web /api/health (and
 * the production monitor behind it) sees a wedged worker as well as a dead
 * one. Returns a stop function.
 */
export function startWorkerHeartbeat(
  isProcessing: () => boolean | Promise<boolean>,
  write: WorkerHeartbeatWriter = writeHeartbeatToRedis,
  intervalMs = WORKER_HEARTBEAT_INTERVAL_MS,
): () => void {
  const beat = async () => {
    if (!(await processingReady(isProcessing))) return;
    // A failed write is what the reader reports as "stale"; never crash the worker.
    await write({ at: Date.now(), release: process.env.BUILD_COMMIT || null }).catch(() => undefined);
  };
  // First beat shortly after start, not a full interval later.
  const first = setTimeout(() => void beat(), Math.min(intervalMs, 5_000));
  const timer = setInterval(() => void beat(), intervalMs);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

/**
 * Liveness endpoint for the worker container.
 *
 * The worker has no public HTTP surface, so process state alone cannot verify it
 * can still reach Redis and PostgreSQL. This endpoint lets the orchestrator
 * satisfy the App Review readiness check. It reuses the same probes the web
 * app exposes, so a stalled worker fails its healthcheck instead of sitting
 * there silently.
 */
export function createWorkerHealthServer(
  checkers: HealthCheckers = {},
  isProcessing: () => boolean | Promise<boolean> = () => false,
  options: { heartbeat?: WorkerHeartbeatWriter | false; heartbeatIntervalMs?: number } = {},
): Server {
  const server = createServer((request, response) => {
    // Only the health path answers; anything else is a misrouted request and
    // must not reveal that a probe surface exists here.
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    void Promise.all([getHealth(checkers), processingReady(isProcessing)])
      .then(([health, ready]) => {
        const status = health.status === "ok" && ready ? "ok" : "degraded";
        response.writeHead(status === "ok" ? 200 : 503, { "content-type": "application/json" });
        response.end(JSON.stringify({ ...health, status, processing: ready ? "ok" : "error" }));
      })
      // getHealth already swallows probe errors into a state, so reaching here
      // means the health check itself broke. Report unhealthy without echoing
      // the error, which can carry a credential-bearing connection string.
      .catch(() => {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "degraded" }));
      });
  });
  // The heartbeat lives with the health server because both describe the same
  // thing - "this worker is consuming" - and the server is the worker's only
  // lifecycle hook here: it starts when the worker listens and stops on close.
  if (options.heartbeat !== false) {
    let stop: (() => void) | undefined;
    server.on("listening", () => {
      stop ??= startWorkerHeartbeat(isProcessing, options.heartbeat || undefined, options.heartbeatIntervalMs);
    });
    server.on("close", () => {
      stop?.();
      stop = undefined;
    });
  }
  return server;
}

export function workerHealthPort(): number {
  const configured = Number(process.env.WORKER_HEALTH_PORT);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_WORKER_HEALTH_PORT;
}
