import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const MAX_VERSIONS = 50;

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/automations/[id]/versions - list version snapshots, newest first.
export async function GET(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const repository = getRepository();
  const automation = await repository.getAutomation(session.workspaceId, id);
  if (!automation) return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  const [versions, members] = await Promise.all([
    repository.listAutomationVersions(session.workspaceId, id, MAX_VERSIONS),
    repository.listMembers(session.workspaceId),
  ]);
  // snapshotBy stores a user id (or "restore"); show people a name, never an id.
  const emails = new Map(members.filter((member) => member.userId).map((member) => [member.userId!, member.email]));
  const label = (snapshotBy?: string) => {
    if (!snapshotBy) return undefined;
    if (snapshotBy === session.userId) return "you";
    if (snapshotBy === "restore") return "a restore";
    return emails.get(snapshotBy) ?? "a former teammate";
  };
  return NextResponse.json({
    data: versions.map((version) => ({ ...version, snapshotBy: label(version.snapshotBy) })),
  });
}
