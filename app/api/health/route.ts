import { NextResponse } from "next/server";
import { isDemoMode } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ status: "ok", mode: isDemoMode() ? "demo" : "configured" });
}
