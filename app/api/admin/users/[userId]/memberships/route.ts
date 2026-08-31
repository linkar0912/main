import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { changeAdminUserMembership } from "@/src/lib/admin/user-service";

const Command = z.object({ action: z.enum(["ADD", "CHANGE_ROLE", "REMOVE"]), workspaceId: z.string().min(1).max(128), role: z.enum(["OWNER", "ADMIN", "MEMBER"]).optional() }).strict();

export async function POST(request: Request, context: RouteContext<"/api/admin/users/[userId]/memberships">) {
  try {
    const { userId } = await context.params;
    const input = Command.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: `user.membership.${input.action.toLowerCase()}`, targetType: "user", targetId: userId });
    return adminJson({ data: await runAuditedAdminMutation(guard, () => changeAdminUserMembership(userId, input)) });
  } catch (error) { return adminRouteError(error, "user_membership_failed"); }
}
