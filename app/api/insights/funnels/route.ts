import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";

export const runtime = "nodejs";

// GET /api/insights/funnels — per-automation delivery outcomes over the trailing
// 7 days: how many events matched, how many DMs went out, and what failed.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const rows = await getRepository().countExecutionsByStatusPerAutomation(session.workspaceId, since);
  return NextResponse.json({ data: rows });
}
