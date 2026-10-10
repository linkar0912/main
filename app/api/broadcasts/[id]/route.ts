import { NextResponse } from "next/server";
import { requireManager } from "@/src/lib/auth/require-role";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Stops a scheduled or sending broadcast. Recipients not yet messaged are
 * marked CANCELLED (the send path never claims those rows), already-sent
 * messages stay sent, and the counters are reconciled so the list shows
 * what actually went out.
 */
async function cancel(request: Request, context: RouteContext): Promise<NextResponse> {
  const guard = await requireManager(request);
  if (!guard.ok) return guard.error;
  const { session } = guard;
  const { id } = await context.params;
  const repository = getRepository();
  const result = await repository.cancelBroadcast(session.workspaceId, id);
  if (result.status === "not_found") return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  if (result.status === "not_cancellable") {
    return NextResponse.json({ error: "This broadcast has already finished.", data: result.broadcast }, { status: 409 });
  }
  await repository.reconcileBroadcastCounters(session.workspaceId, id).catch(() => undefined);
  const broadcast = await repository.getBroadcast(session.workspaceId, id) ?? result.broadcast;
  return NextResponse.json({ data: broadcast });
}

// PATCH /api/broadcasts/:id  { status: "CANCELLED" }
export async function PATCH(request: Request, context: RouteContext) {
  const body = await request.clone().json().catch(() => null) as { status?: unknown } | null;
  if (body?.status !== "CANCELLED") {
    return NextResponse.json({ error: "Only { \"status\": \"CANCELLED\" } is supported" }, { status: 400 });
  }
  return cancel(request, context);
}

// DELETE /api/broadcasts/:id - same as cancelling; the row stays for history.
export async function DELETE(request: Request, context: RouteContext) {
  return cancel(request, context);
}
