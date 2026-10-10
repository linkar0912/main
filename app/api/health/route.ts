import { NextResponse } from "next/server";
import { canViewHealthDetail, getCachedWebHealth, HEALTH_DETAIL_HEADER, isWebServing } from "@/src/lib/health";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const health = await getCachedWebHealth();
  // The HTTP status is what the container healthcheck reads, so it follows
  // this container's own dependencies; a stale worker shows in `status` only.
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
