import { NextResponse } from "next/server";
import { validateFlowDefinition } from "@/src/lib/automation/definition";
import { getRepository, getWorkspaceId } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ data: await getRepository().listAutomations(getWorkspaceId()) });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: unknown; definition?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const definition = validateFlowDefinition(body.definition);
    const automation = await getRepository().createAutomation(getWorkspaceId(), { name, definition });
    return NextResponse.json({ data: automation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid automation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
