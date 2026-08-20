import { NextResponse } from "next/server";
import { getHealth } from "@/src/lib/health";

export const runtime = "nodejs";

export async function GET() {
  const health = await getHealth();
  return NextResponse.json(health, { status: health.status === "ok" ? 200 : 503 });
}
