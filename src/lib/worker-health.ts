import { createServer, type Server } from "node:http";
import { getHealth, type HealthCheckers } from "./health";

export const DEFAULT_WORKER_HEALTH_PORT = 3001;

/**
 * Liveness endpoint for the worker container.
 *
 * The worker has no HTTP surface of its own, so Coolify reported it as
 * `running:unknown` - the container was up, but nothing verified it could
 * still reach Redis and PostgreSQL, which is exactly what the App Review
 * runbook asks us to confirm. This reuses the same probes the web app exposes
 * so a stalled worker fails its healthcheck instead of sitting there silently.
 */
export function createWorkerHealthServer(checkers: HealthCheckers = {}): Server {
  return createServer((request, response) => {
    // Only the health path answers; anything else is a misrouted request and
    // must not reveal that a probe surface exists here.
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    void getHealth(checkers)
      .then((health) => {
        response.writeHead(health.status === "ok" ? 200 : 503, { "content-type": "application/json" });
        response.end(JSON.stringify(health));
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
