import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { resolveSnapshotProvider } from "@/src/lib/repository";
import { checkConnectedPin, checkDefinitionForTarget } from "@/src/lib/automation/activation-readiness";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; versionId: string }> };

// POST /api/automations/[id]/versions/[versionId]/restore - restore the named snapshot.
export async function POST(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, versionId } = await context.params;
  const repository = getRepository();
  const [automation, version] = await Promise.all([
    repository.getAutomation(session.workspaceId, id),
    repository.getAutomationVersion(session.workspaceId, id, versionId),
  ]);
  if (!automation || !version) return NextResponse.json({ error: "Version or automation not found" }, { status: 404 });

  // A snapshot can be months old: its account may be disconnected and its
  // definition may fail rules added since. Restoring brings back the saved
  // on/off state too, so an ACTIVE snapshot gets the full activation checks.
  const target = {
    provider: resolveSnapshotProvider(version, automation.provider),
    instagramAccountId: version.instagramAccountId ?? null,
    facebookPageId: version.facebookPageId ?? null,
    definition: version.definition,
  };
  const pinError = await checkConnectedPin(session.workspaceId, target, { requirePin: version.status === "ACTIVE" }, repository);
  if (pinError) {
    return NextResponse.json({ error: `This version can't be restored yet. ${pinError}`, code: "restore_blocked" }, { status: 409 });
  }
  const definitionCheck = checkDefinitionForTarget(target);
  if (!definitionCheck.ok) {
    return NextResponse.json({
      error: `This version can't be restored. ${definitionCheck.error}`,
      code: "restore_blocked",
      ...(definitionCheck.issues ? { issues: definitionCheck.issues } : {}),
    }, { status: 409 });
  }

  const restored = await repository.restoreAutomationVersion(
    session.workspaceId,
    id,
    versionId,
    session.userId,
  );
  if (!restored) return NextResponse.json({ error: "Version or automation not found" }, { status: 404 });
  return NextResponse.json({ data: restored });
}
