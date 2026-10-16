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

/** Monotonic milliseconds, so a wall-clock step never shortens a window. */
const monotonicNow = () => performance.now();

/**
 * A consumer that started or finished a job this recently is consuming,
 * whatever its connections report.
 */
export const RECENT_ACTIVITY_MS = 60_000;

/**
 * The blocking-client state that means stuck. After a Valkey outage BullMQ's
 * blocking client can sit in "reconnecting" for good: the wedge. Every other
 * state passes. "end" and "close" are what BullMQ's own stuck-command watchdog
 * leaves when it disconnects the blocking client, and the worker connects it
 * again only on its next wait for a job, which a worker working through a
 * backlog never needs, so a busy, healthy worker can read "end" for as long as
 * the backlog lasts. "connecting" and "connect" pass through on their own (a
 * slow Valkey keeps a client in "connect" for seconds at a time).
 */
const BLOCKING_CLIENT_STUCK = "reconnecting";

/** A BullMQ Worker and the ioredis connection it was given, as src/worker.ts wires them. */
export type ProcessingConsumer = {
  consumer: { isRunning(): boolean; isPaused(): boolean; waitUntilReady(): Promise<unknown> };
  connection: { status: string };
  /** When this consumer last started or finished a job (see trackConsumerActivity). */
  lastActivityAt?: number;
};

/**
 * True while every consumer is running, not paused, and either took a job in
 * the last minute or is connected: its own Redis connection ready and BullMQ's
 * dedicated blocking client not stuck reconnecting. Each consumer is judged on
 * its own activity, so a busy one cannot hide a stuck one.
 */
export async function consumersProcessing(
  entries: readonly ProcessingConsumer[],
  now: () => number = monotonicNow,
): Promise<boolean> {
  const ready = await Promise.all(entries.map(async ({ consumer, connection, lastActivityAt }) => {
    if (!consumer.isRunning() || consumer.isPaused()) return false;
    // Taking jobs is the proof. The connection checks below only stand in for
    // it, and can misread a worker that is busy with a backlog (see
    // BLOCKING_CLIENT_STUCK).
    if (lastActivityAt !== undefined && now() - lastActivityAt < RECENT_ACTIVITY_MS) return true;
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
    return !blocking || blocking.status !== BLOCKING_CLIENT_STUCK;
  }));
  return ready.every(Boolean);
}

/**
 * Remembers when a BullMQ Worker last started or finished a job, for
 * consumersProcessing's lastActivityAt. Returns a reader.
 */
export function trackConsumerActivity(
  consumer: { on(event: "active" | "completed" | "failed", listener: () => void): unknown },
  now: () => number = monotonicNow,
): () => number | undefined {
  let lastActivityAt: number | undefined;
  const touch = () => {
    lastActivityAt = now();
  };
  for (const event of ["active", "completed", "failed"] as const) consumer.on(event, touch);
  return () => lastActivityAt;
}

/** How long BullMQ may report it is not consuming before the worker exits. */
export const DEFAULT_LIVENESS_EXIT_AFTER_MS = 5 * 60_000;
const MIN_LIVENESS_EXIT_AFTER_MS = 60_000;
const LIVENESS_CHECK_INTERVAL_MS = 15_000;

/** The watchdog window in effect, and why a configured value was not used as written. */
export type LivenessSetting = { exitAfterMs: number; warning?: string };

/**
 * WORKER_LIVENESS_EXIT_AFTER_MS: 0 turns the exit off; unset means the
 * default; anything under a minute is raised to a minute, so a Redis blip
 * never restarts the worker. An unreadable value (say "off" or "5m") falls
 * back to the default with a warning for src/worker.ts to log, rather than
 * stopping the worker over a typo in a safety setting.
 */
export function readLivenessExitAfterMs(
  raw: string | undefined = process.env.WORKER_LIVENESS_EXIT_AFTER_MS,
): LivenessSetting {
  if (raw === undefined || raw.trim() === "") return { exitAfterMs: DEFAULT_LIVENESS_EXIT_AFTER_MS };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    return {
      exitAfterMs: DEFAULT_LIVENESS_EXIT_AFTER_MS,
      warning: `WORKER_LIVENESS_EXIT_AFTER_MS must be a whole number of milliseconds, 0 to turn it off (got "${raw}"); using the default`,
    };
  }
  if (value === 0) return { exitAfterMs: 0 };
  if (value < MIN_LIVENESS_EXIT_AFTER_MS) {
    return {
      exitAfterMs: MIN_LIVENESS_EXIT_AFTER_MS,
      warning: `WORKER_LIVENESS_EXIT_AFTER_MS is under a minute (got "${raw}"); using one minute`,
    };
  }
  return { exitAfterMs: value };
}

/** The window from readLivenessExitAfterMs, without the warning. */
export function livenessExitAfterMs(raw: string | undefined = process.env.WORKER_LIVENESS_EXIT_AFTER_MS): number {
  return readLivenessExitAfterMs(raw).exitAfterMs;
}

/**
 * Calls onStuck once when isProcessing (the /live signal) has been false for
 * exitAfterMs without a break. Production runs the worker under plain docker
 * compose, where a failing health check only marks the container unhealthy and
 * nothing restarts it, so a worker whose BullMQ connection is wedged (see
 * consumersProcessing) would sit there for good. src/worker.ts exits on this,
 * and the container's restart policy starts a fresh worker with new
 * connections. Counting starts at launch, so a worker that never becomes ready
 * counts too. A queue paused from the owner console does not trip it: that
 * pause lives in Redis, and the worker stays running and connected.
 *
 * Checks run one at a time, about every checkIntervalMs, jittered to between
 * two thirds and four thirds of it so they cannot lock onto a periodic
 * reconnect cycle and only ever sample its failing part. Durations use a
 * monotonic clock. The returned stop function also discards a check that is
 * still running, so a stopped watchdog never calls onStuck.
 */
export function startLivenessWatchdog(
  isProcessing: () => boolean | Promise<boolean>,
  onStuck: (failingForMs: number) => void,
  options: { exitAfterMs?: number; checkIntervalMs?: number; now?: () => number; random?: () => number } = {},
): () => void {
  const exitAfterMs = options.exitAfterMs ?? livenessExitAfterMs();
  if (exitAfterMs <= 0) return () => undefined;
  const now = options.now ?? monotonicNow;
  const random = options.random ?? Math.random;
  const intervalMs = options.checkIntervalMs ?? LIVENESS_CHECK_INTERVAL_MS;
  let failingSince: number | null = now();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    void processingReady(isProcessing).then((ready) => {
      if (stopped) return;
      if (ready) {
        failingSince = null;
      } else {
        failingSince ??= now();
        const failingFor = now() - failingSince;
        if (failingFor >= exitAfterMs) {
          stopped = true;
          onStuck(failingFor);
          return;
        }
      }
      schedule();
    });
  };
  const schedule = () => {
    timer = setTimeout(check, intervalMs * (2 + 2 * random()) / 3);
    timer.unref();
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** The logger methods createWorkerShutdown uses (src/lib/logger's shape). */
type ShutdownLog = {
  info(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
};

/**
 * The worker's shutdown: runs once, then exits with the code it was given (1
 * from the liveness watchdog, 0 for a signal). BullMQ's Worker.close() waits
 * for running jobs and for its connections, and against a wedged or
 * unreachable Valkey that wait never ends. So whatever started the shutdown,
 * the process is forced out with code 1 after forceExitAfterMs, and the log
 * says so instead of going quiet.
 */
export function createWorkerShutdown(options: {
  close: () => Promise<void>;
  forceExitAfterMs: number;
  exit: (code: number) => void;
  log: ShutdownLog;
  onStart?: () => void;
}): (reason: string, exitCode?: number) => Promise<void> {
  let started = false;
  return async (reason, exitCode = 0) => {
    if (started) return;
    started = true;
    options.onStart?.();
    options.log.info("Worker shutting down", { signal: reason });
    // Not unref'd: this timer is what guarantees the exit.
    const forced = setTimeout(() => {
      options.log.error("Worker shutdown did not finish; forcing exit", { signal: reason, afterMs: options.forceExitAfterMs });
      options.exit(1);
    }, options.forceExitAfterMs);
    try {
      await options.close();
      clearTimeout(forced);
      options.exit(exitCode);
    } catch (error) {
      clearTimeout(forced);
      options.log.error("Worker shutdown failed", { error: error instanceof Error ? error.message : String(error) });
      options.exit(1);
    }
  };
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
