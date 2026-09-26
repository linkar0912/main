import { createServer, type Server } from "node:http";
import { getHealth, type HealthCheckers } from "./health";

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
): Server {
  return createServer((request, response) => {
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
}

export function workerHealthPort(): number {
  const configured = Number(process.env.WORKER_HEALTH_PORT);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_WORKER_HEALTH_PORT;
}
