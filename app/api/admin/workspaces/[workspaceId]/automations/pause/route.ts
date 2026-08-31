import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { pauseAdminWorkspaceAutomations } from "@/src/lib/admin/workspace-service";

const PauseCommand = z.object({ version: z.number().int().positive() }).strict();

export async function POST(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]/automations/pause">) {
  try {
    const { workspaceId } = await context.params;
    const input = PauseCommand.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: "workspace.automations.pause_all", targetType: "workspace", targetId: workspaceId });
    return adminJson({ data: await runAuditedAdminMutation(guard, () => pauseAdminWorkspaceAutomations(workspaceId, input.version)) });
  } catch (error) {
    return adminRouteError(error, "workspace_pause_failed");
  }
}
