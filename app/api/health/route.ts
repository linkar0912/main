import { NextResponse } from "next/server";
import { canViewHealthDetail, getCachedWebHealth, HEALTH_DETAIL_HEADER, isWebServing } from "@/src/lib/health";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Each probe has its own deadline (5 s for the database, 2 s for Redis; see
  // src/lib/health.ts), so this answers even when a dependency does not.
  const health = await getCachedWebHealth();
  // This is readiness: the HTTP status follows this container's own
  // dependencies, and a stale worker shows in `status` only. The image's
  // HEALTHCHECK probes /api/health/live, so a dependency outage does not get
  // the only web task replaced.
  const serving = isWebServing(health);
  const httpStatus = serving ? 200 : 503;
  // The public body carries only this container's own state, its database
  // and Redis reachability, and the baked commit. Dokploy's service
  // healthcheck reads dependencies.database/redis and the host release script
  // reads release, both without the detail token; a worker still on the
  // previous release (no heartbeat yet) must not fail a web rollout.
  const body = canViewHealthDetail(request.headers.get(HEALTH_DETAIL_HEADER))
    ? health
    : {
      status: serving ? "ok" : "degraded",
      release: health.release,
      dependencies: { database: health.dependencies.database, redis: health.dependencies.redis },
    };
  return NextResponse.json(body, { status: httpStatus, headers: { "Cache-Control": "no-store" } });
}
