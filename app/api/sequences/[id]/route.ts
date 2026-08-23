import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { sequencePatchSchema } from "@/src/lib/automation/sequence";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const patch = sequencePatchSchema.parse(await request.json());
    if (patch.sourceAutomationId) {
      const source = await getRepository().getAutomation(session.workspaceId, patch.sourceAutomationId);
      if (!source) return NextResponse.json({ error: "Source automation not found" }, { status: 400 });
    }
    const record = await getRepository().updateSequence(session.workspaceId, id, patch);
    if (!record) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    return NextResponse.json({ data: record });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid update" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const deleted = await getRepository().deleteSequence(session.workspaceId, id);
  if (!deleted) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  return NextResponse.json({ data: { deleted: true } });
}
