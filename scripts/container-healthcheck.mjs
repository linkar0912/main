// Docker HEALTHCHECK for the shared image. The same image runs the web server
// (`next start`, /api/health/live on PORT) and the worker (`node
// dist/worker.js`, /live on WORKER_HEALTH_PORT), and a HEALTHCHECK cannot see
// which command the container was started with. Probe the web endpoint first;
// only when nothing listens there (the worker container) fall through to the
// worker endpoint. Any non-2xx answer, or a hung one, is unhealthy.
//
// Both are liveness endpoints with no database or Redis I/O. A dependency
// outage shows on /api/health and the worker's /health instead; failing this
// probe for it would only get the container replaced, and a replacement
// cannot fix the database or Redis.
const port = process.env.PORT || "3000";
const workerPort = process.env.WORKER_HEALTH_PORT || "3001";
const targets = [`http://127.0.0.1:${port}/api/health/live`, `http://127.0.0.1:${workerPort}/live`];
// Inside the Dockerfile's --timeout=10s, with room for node to start.
const PROBE_TIMEOUT_MS = 8_000;

for (const url of targets) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: "error" });
  } catch (error) {
    // Connection refused means this container does not serve that endpoint.
    if (error?.cause?.code === "ECONNREFUSED") continue;
    process.exit(1);
  }
  process.exit(response.ok ? 0 : 1);
}
process.exit(1);
