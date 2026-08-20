import { NextResponse } from "next/server";
import { validateFlowDefinition } from "@/src/lib/automation/definition";
import { getRepository } from "@/src/lib/repository-provider";
import { getOwnerSessionFromRequest } from "@/src/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = getOwnerSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ data: await getRepository().listAutomations(session.workspaceId) });
}

export async function POST(request: Request) {
  const session = getOwnerSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { name?: unknown; definition?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const definition = validateFlowDefinition(body.definition);
    const automation = await getRepository().createAutomation(session.workspaceId, { name, definition });
    return NextResponse.json({ data: automation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid automation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
