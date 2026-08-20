import { NextResponse } from "next/server";
import { validateFlowDefinition } from "@/src/lib/automation/definition";
import { getRepository, getWorkspaceId } from "@/src/lib/repository-provider";
import type { AutomationStatus } from "@/src/lib/repository";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { name?: unknown; status?: unknown; definition?: unknown };
  const patch: { name?: string; status?: AutomationStatus; definition?: ReturnType<typeof validateFlowDefinition> } = {};

  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.status === "DRAFT" || body.status === "ACTIVE" || body.status === "PAUSED") patch.status = body.status;
  if (body.definition !== undefined) {
    try {
      patch.definition = validateFlowDefinition(body.definition);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid definition" }, { status: 400 });
    }
  }

  const automation = await getRepository().updateAutomation(getWorkspaceId(), id, patch);
  if (!automation) return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  return NextResponse.json({ data: automation });
}
