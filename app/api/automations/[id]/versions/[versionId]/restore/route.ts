import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; versionId: string }> };

// POST /api/automations/[id]/versions/[versionId]/restore - restore the named snapshot.
export async function POST(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, versionId } = await context.params;
  const repository = getRepository();
  const automation = await repository.restoreAutomationVersion(
    session.workspaceId,
    id,
    versionId,
    session.userId,
  );
  if (!automation) return NextResponse.json({ error: "Version or automation not found" }, { status: 404 });
  return NextResponse.json({ data: automation });
}
