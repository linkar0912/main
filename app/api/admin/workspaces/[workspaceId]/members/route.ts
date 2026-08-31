import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { changeAdminWorkspaceMember, removeAdminWorkspaceMember } from "@/src/lib/admin/workspace-service";

const MemberCommand = z.object({
  action: z.enum(["ADD", "CHANGE_ROLE", "TRANSFER_OWNERSHIP"]),
  userId: z.string().uuid(),
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
}).strict();

export async function POST(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]/members">) {
  try {
    const { workspaceId } = await context.params;
    const input = MemberCommand.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: `workspace.member.${input.action.toLowerCase()}`, targetType: "workspace_member", targetId: input.userId });
    const member = await runAuditedAdminMutation(guard, () => changeAdminWorkspaceMember(workspaceId, input));
    return adminJson({ data: member });
  } catch (error) {
    return adminRouteError(error, "workspace_member_update_failed");
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]/members">) {
  try {
    const { workspaceId } = await context.params;
    const userId = new URL(request.url).searchParams.get("userId") ?? "";
    if (!z.string().uuid().safeParse(userId).success) return adminJson({ error: "invalid_user_id" }, { status: 422 });
    const guard = await requireAdminWrite(request, { action: "workspace.member.remove", targetType: "workspace_member", targetId: userId });
    return adminJson({ data: await runAuditedAdminMutation(guard, () => removeAdminWorkspaceMember(workspaceId, userId)) });
  } catch (error) {
    return adminRouteError(error, "workspace_member_remove_failed");
  }
}
