import { NextResponse } from "next/server";
import { canViewHealthDetail, getCachedWebHealth, HEALTH_DETAIL_HEADER, isWebServing } from "@/src/lib/health";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const health = await getCachedWebHealth();
  // The HTTP status is what the container healthcheck reads, so it follows
  // this container's own dependencies; a stale worker shows in `status` only.
  const httpStatus = isWebServing(health) ? 200 : 503;
  const body = canViewHealthDetail(request.headers.get(HEALTH_DETAIL_HEADER)) ? health : { status: health.status };
  return NextResponse.json(body, { status: httpStatus, headers: { "Cache-Control": "no-store" } });
}
