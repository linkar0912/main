import { NextResponse } from "next/server";
import { validateFlowDefinition } from "@/src/lib/automation/definition";
import { getRepository } from "@/src/lib/repository-provider";
import { getOwnerSessionFromRequest } from "@/src/lib/auth/session";
import type { AutomationStatus, UpdateAutomationInput } from "@/src/lib/repository";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = getOwnerSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json()) as { name?: unknown; status?: unknown; definition?: unknown };
  const patch: UpdateAutomationInput = {};

  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.status === "DRAFT" || body.status === "ACTIVE" || body.status === "PAUSED") patch.status = body.status;
  if (body.definition !== undefined) {
    try {
      patch.definition = validateFlowDefinition(body.definition);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid definition" }, { status: 400 });
    }
  }

  const repository = getRepository();
  const current = await repository.getAutomation(session.workspaceId, id);
  if (!current) return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  if (body.status === "ACTIVE") {
    patch.status = "ACTIVE";
    patch.activatedAt = new Date().toISOString();
    const definition = patch.definition ?? current.definition;
    if (definition.version === 2 && definition.trigger.source === "next_media") patch.boundMediaId = null;
  }

  const automation = await repository.updateAutomation(session.workspaceId, id, patch);
  if (!automation) return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  return NextResponse.json({ data: automation });
}
