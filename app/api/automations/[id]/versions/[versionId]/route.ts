import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; versionId: string }> };

// GET /api/automations/[id]/versions/[versionId] - one version snapshot.
export async function GET(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, versionId } = await context.params;
  const repository = getRepository();
  const version = await repository.getAutomationVersion(session.workspaceId, id, versionId);
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  return NextResponse.json({ data: version });
}
