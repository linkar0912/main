import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/automations/:id/duplicate - saves an exact copy as a DRAFT so variants
// can be tuned without rebuilding from scratch.
export async function POST(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const repository = getRepository();
  const original = await repository.getAutomation(session.workspaceId, id);
  if (!original) return NextResponse.json({ error: "Automation not found" }, { status: 404 });

  const trimmed = original.name.trim();
  const suffix = " (copy)";
  const name = trimmed.length + suffix.length <= 120 ? `${trimmed}${suffix}` : `${trimmed.slice(0, 120 - suffix.length)}${suffix}`;
  const copy = await repository.createAutomation(session.workspaceId, {
    name,
    definition: original.definition,
  });
  return NextResponse.json({ data: copy }, { status: 201 });
}
