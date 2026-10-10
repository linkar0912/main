import { NextResponse } from "next/server";

import { getValidatedSession, type AppSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import type { MemberRole } from "@/src/lib/repository";

/** Roles allowed to change workspace-wide state (connections, sends, exports, settings). */
export const MANAGER_ROLES: readonly MemberRole[] = ["OWNER", "ADMIN"];

export type RoleGuard =
  | { ok: true; session: AppSession; role: MemberRole }
  | { ok: false; error: NextResponse };

/**
 * Resolves the session and the caller's workspace role in one step. A missing
 * session is a 401; a member whose role is not in `allowed` (or who no longer
 * has a member row) gets a 403 `{ error: "forbidden" }` - the same contract
 * billing and team invitations already use, so the UI can map it once.
 */
export async function requireRole(
  request: Request,
  allowed: readonly MemberRole[] = MANAGER_ROLES,
): Promise<RoleGuard> {
  const session = await getValidatedSession(request);
  if (!session) return { ok: false, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = await getRepository().getMemberRole(session.workspaceId, session.email);
  if (!role || !allowed.includes(role)) {
    return { ok: false, error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, session, role };
}

/** OWNER or ADMIN. */
export function requireManager(request: Request): Promise<RoleGuard> {
  return requireRole(request, MANAGER_ROLES);
}
