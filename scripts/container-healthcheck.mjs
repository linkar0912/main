// Docker HEALTHCHECK for the shared image. The same image runs the web server
// (`next start`, /api/health on PORT) and the worker (`node dist/worker.js`,
// /health on WORKER_HEALTH_PORT), and a HEALTHCHECK cannot see which command
// the container was started with. Probe the web endpoint first; only when
// nothing listens there (the worker container) fall through to the worker
// endpoint. Any non-2xx answer, or a hung one, is unhealthy.
const port = process.env.PORT || "3000";
const workerPort = process.env.WORKER_HEALTH_PORT || "3001";
const targets = [`http://127.0.0.1:${port}/api/health`, `http://127.0.0.1:${workerPort}/health`];

for (const url of targets) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(4_000), redirect: "error" });
  } catch (error) {
    // Connection refused means this container does not serve that endpoint.
    if (error?.cause?.code === "ECONNREFUSED") continue;
    process.exit(1);
  }
  process.exit(response.ok ? 0 : 1);
}
process.exit(1);
