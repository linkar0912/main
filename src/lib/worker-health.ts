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

/** A BullMQ Worker and the ioredis connection it was given, as src/worker.ts wires them. */
export type ProcessingConsumer = {
  consumer: { isRunning(): boolean; isPaused(): boolean; waitUntilReady(): Promise<unknown> };
  connection: { status: string };
};

/**
 * True while every consumer is running, not paused, and connected: its own
 * Redis connection and BullMQ's dedicated blocking client both ready.
 */
export async function consumersProcessing(entries: readonly ProcessingConsumer[]): Promise<boolean> {
  const ready = await Promise.all(entries.map(async ({ consumer, connection }) => {
    if (!consumer.isRunning() || consumer.isPaused()) return false;
    await consumer.waitUntilReady();
    if (connection.status !== "ready") return false;
    // Reads a BullMQ 6.1.2 internal: the Worker's dedicated blocking client,
    // which waits for new jobs. After a Valkey outage, BullMQ's stuck-command
    // watchdog plus ioredis 6.0.0's disconnect() can leave that client in
    // "reconnecting" for good while the main connection is ready again, so
    // the worker stops taking jobs but would still look alive (verifier
    // wedge-repro.mts). A Worker without this internal keeps the check above.
    const blocking = await (consumer as unknown as {
      backend?: { blockingClient?: Promise<{ status?: string } | undefined> };
    }).backend?.blockingClient;
    return !blocking || blocking.status === "ready";
  }));
  return ready.every(Boolean);
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
 * Health endpoints for the worker container.
 *
 * `/live` is liveness for the image's HEALTHCHECK: the process answers and
 * BullMQ reports it is consuming, with no dependency I/O.
 *
 * `/health` is the full view. The worker has no public HTTP surface, so
 * process state alone cannot verify it can still reach Redis and PostgreSQL.
 * This endpoint lets the orchestrator satisfy the App Review readiness check.
 * It reuses the same probes the web app exposes, so a stalled worker shows as
 * degraded instead of sitting there silently.
 */
export function createWorkerHealthServer(
  checkers: HealthCheckers = {},
  isProcessing: () => boolean | Promise<boolean> = () => false,
  options: { heartbeat?: WorkerHeartbeatWriter | false; heartbeatIntervalMs?: number } = {},
): Server {
  const server = createServer((request, response) => {
    // Liveness for the image's HEALTHCHECK: this handler running at all shows
    // the event loop responds, and BullMQ must report it is consuming (in
    // src/worker.ts, consumers running on ready Redis connections). No
    // database or Redis command is sent, so a slow or unreachable database
    // shows on /health without getting the worker container replaced.
    if (request.url === "/live") {
      void processingReady(isProcessing).then((ready) => {
        response.writeHead(ready ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
        response.end(JSON.stringify({
          status: ready ? "ok" : "degraded",
          release: process.env.BUILD_COMMIT || null,
          processing: ready ? "ok" : "error",
        }));
      });
      return;
    }
    // Only the probe paths answer; anything else is a misrouted request and
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
