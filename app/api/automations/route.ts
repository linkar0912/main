import { NextResponse } from "next/server";
import { validateFlowDefinition } from "@/src/lib/automation/definition";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";

export const runtime = "nodejs";

/**
 * Validates a client-supplied account pin. Returns undefined when the client did
 * not ask for a specific account, the igUserId when it is a CONNECTED connection
 * of this workspace, or null when the pin is invalid (unknown/disconnected/foreign).
 */
async function resolveInstagramAccountId(
  repository: ReturnType<typeof getRepository>,
  workspaceId: string,
  value: unknown,
): Promise<string | undefined | null> {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const connections = await repository.listConnections(workspaceId);
  const match = connections.find((connection) => connection.igUserId === value && connection.status === "CONNECTED");
  return match ? match.igUserId : null;
}

export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ data: await getRepository().listAutomations(session.workspaceId) });
}

export async function POST(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let body: { name?: unknown; definition?: unknown; instagramAccountId?: unknown };
    try {
      body = (await request.json()) as { name?: unknown; definition?: unknown };
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: "Name must be 120 characters or fewer" }, { status: 400 });
    const definition = validateFlowDefinition(body.definition);
    const instagramAccountId = await resolveInstagramAccountId(getRepository(), session.workspaceId, body.instagramAccountId);
    if (instagramAccountId === null) {
      return NextResponse.json({ error: "That Instagram account is not connected to this workspace" }, { status: 400 });
    }
    const automation = await getRepository().createAutomation(session.workspaceId, {
      name,
      definition,
      ...(instagramAccountId ? { instagramAccountId } : {}),
    });
    return NextResponse.json({ data: automation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid automation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
