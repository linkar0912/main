import { z } from "zod";

import { userAuditSnapshot } from "@/src/lib/admin/audit-snapshots";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { isAdminUserId } from "@/src/lib/admin/ids";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { setAdminUserAccess } from "@/src/lib/admin/user-service";

const Command = z.object({ action: z.enum(["SUSPEND", "RESTORE", "REVOKE_LINKAR_SESSIONS", "BAN", "UNBAN"]) }).strict();

export async function POST(request: Request, context: RouteContext<"/api/admin/users/[userId]/access">) {
  try {
    const { userId } = await context.params;
    if (!isAdminUserId(userId)) return adminJson({ error: "user_not_found" }, { status: 404 });
    const input = Command.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: `user.access.${input.action.toLowerCase()}`, targetType: "user", targetId: userId });
    const data = await runAuditedAdminMutation(
      guard,
      () => setAdminUserAccess(userId, { ...input, reason: guard.reason, actorUserId: guard.owner.userId }),
      { before: await userAuditSnapshot(userId) },
    );
    return adminJson({ data });
  } catch (error) { return adminRouteError(error, "user_access_failed"); }
}
