import { NextResponse } from "next/server";
import { canViewHealthDetail, getCachedWebHealth, HEALTH_DETAIL_HEADER, isWebServing } from "@/src/lib/health";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const health = await getCachedWebHealth();
  // The HTTP status is what the container healthcheck reads, so it follows
  // this container's own dependencies; a stale worker shows in `status` only.
  const serving = isWebServing(health);
  const httpStatus = serving ? 200 : 503;
  // The public body carries only this container's own state and the baked
  // commit: release scripts and outside monitors confirm a rollout by it
  // without the detail token, and a worker that is still on the previous
  // release (no heartbeat yet) must not read as a failed web rollout.
  const body = canViewHealthDetail(request.headers.get(HEALTH_DETAIL_HEADER))
    ? health
    : { status: serving ? "ok" : "degraded", release: health.release };
  return NextResponse.json(body, { status: httpStatus, headers: { "Cache-Control": "no-store" } });
}
