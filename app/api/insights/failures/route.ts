import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const MAX_FAILURES = 50;

// GET /api/insights/failures - the most recent FAILED outbound deliveries
// across the workspace, newest first. Powers the failure-monitoring panel.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const repository = getRepository();
  const failures = await repository.listRecentOutboundFailures(session.workspaceId, MAX_FAILURES);
  return NextResponse.json({ data: failures });
}
