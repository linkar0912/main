import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { setAdminWorkspaceLifecycle } from "@/src/lib/admin/workspace-service";

const LifecycleCommand = z.object({ action: z.enum(["SUSPEND", "RESTORE"]), version: z.number().int().positive() }).strict();

export async function POST(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]/lifecycle">) {
  try {
    const { workspaceId } = await context.params;
    const input = LifecycleCommand.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: `workspace.${input.action.toLowerCase()}`, targetType: "workspace", targetId: workspaceId });
    const workspace = await runAuditedAdminMutation(guard, () => setAdminWorkspaceLifecycle(workspaceId, {
      ...input,
      reason: guard.reason,
      actorUserId: guard.owner.userId,
    }));
    return adminJson({ data: workspace });
  } catch (error) {
    return adminRouteError(error, "workspace_lifecycle_failed");
  }
}
