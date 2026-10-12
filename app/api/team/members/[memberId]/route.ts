import { NextResponse } from "next/server";
import { z } from "zod";
import { requireManager } from "@/src/lib/auth/require-role";
import { logger } from "@/src/lib/logger";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const patchSchema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) }).strict();
type Context = { params: Promise<{ memberId: string }> };

// PATCH /api/team/members/:memberId { role: "ADMIN" | "MEMBER" }
// Owners and admins (the people who can invite) move another member between
// Admin and Member. The owner's seat never changes here, so a workspace can
// never lose its last owner, and nobody changes their own role. Cross-site
// requests are refused by proxy.ts before this runs.
export async function PATCH(request: Request, context: Context) {
  const guard = await requireManager(request);
  if (!guard.ok) return guard.error;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_role" }, { status: 400 });

  const { memberId } = await context.params;
  const { session } = guard;
  const repository = getRepository();
  const members = await repository.listMembers(session.workspaceId);
  const member = members.find((candidate) => candidate.id === memberId);
  if (!member) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const isSelf = member.email.toLowerCase() === session.email.toLowerCase()
    || (Boolean(member.userId) && member.userId === session.userId);
  if (isSelf) return NextResponse.json({ error: "cannot_change_own_role" }, { status: 403 });
  if (member.role === "OWNER") return NextResponse.json({ error: "cannot_change_owner" }, { status: 403 });

  const role = parsed.data.role;
  if (member.role !== role) {
    // The repository refuses an OWNER row too, so a member promoted to owner
    // in the meantime is not demoted by a stale request.
    if (!await repository.updateMemberRole(session.workspaceId, member.email, role)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    logger.info("Team member role changed", {
      workspaceId: session.workspaceId,
      memberId: member.id,
      from: member.role,
      to: role,
      changedByUserId: session.userId,
    });
  }
  return NextResponse.json({ member: { id: member.id, email: member.email, role } });
}
