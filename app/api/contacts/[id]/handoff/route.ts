import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { logger } from "@/src/lib/logger";

export const runtime = "nodejs";

const MAX_REASON_LENGTH = 500;

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/contacts/[id]/handoff - assign a teammate and pause automated sends
// for this person. Used when the conversation needs a human touch.
export async function POST(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const payload = (body ?? {}) as {
    reason?: unknown;
    pauseAutomations?: unknown;
    assigneeUserId?: unknown;
    notes?: unknown;
  };
  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, MAX_REASON_LENGTH) : "";
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }
  const pauseAutomations = payload.pauseAutomations !== false; // default true
  // Omitted = leave as is; explicit null (or an empty string) = clear. A
  // handoff that only sets a reason must not wipe the assignee or notes.
  const assigneeUserId = payload.assigneeUserId === undefined
    ? undefined
    : typeof payload.assigneeUserId === "string" ? payload.assigneeUserId.trim() || null : null;
  const notes = payload.notes === undefined
    ? undefined
    : typeof payload.notes === "string" ? payload.notes.trim().slice(0, 4_000) || null : null;

  const repository = getRepository();
  const contact = await repository.getContactById(session.workspaceId, id);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (assigneeUserId) {
    const members = await repository.listMembers(session.workspaceId);
    if (!members.some((member) => member.userId === assigneeUserId)) return NextResponse.json({ error: "Assignee is not a workspace member" }, { status: 400 });
  }

  const profile = await repository.updateContactProfile(session.workspaceId, id, {
    ...(assigneeUserId !== undefined ? { assigneeUserId } : {}),
    ...(notes !== undefined ? { notes } : {}),
  });

  let pausedCount = 0;
  if (pauseAutomations) {
    pausedCount = await repository.pauseParticipantsBySender(
      session.workspaceId,
      contact.instagramAccountId,
      contact.igScopedUserId,
      reason,
      session.userId,
      new Date().toISOString(),
    );
  }
  logger.info("Contact handed off to human", {
    workspaceId: session.workspaceId,
    contactId: id,
    pausedCount,
    pauseAutomations,
  });
  return NextResponse.json({
    data: {
      contact: profile,
      pausedCount,
    },
  });
}

// DELETE /api/contacts/[id]/handoff - hand the conversation back to the
// automations: clears the handoff pause so the runner messages them again.
export async function DELETE(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const repository = getRepository();
  const contact = await repository.getContactById(session.workspaceId, id);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const [resumedCount, contactResumed] = await Promise.all([
    repository.resumeParticipantsBySender(
      session.workspaceId,
      contact.instagramAccountId,
      contact.igScopedUserId,
    ),
    // Also clears the pause set when a teammate replied by hand.
    repository.resumeContactAutomations(session.workspaceId, id),
  ]);
  logger.info("Contact handed back to automations", { workspaceId: session.workspaceId, contactId: id, resumedCount, contactResumed });
  return NextResponse.json({ data: { resumedCount, contactResumed } });
}
