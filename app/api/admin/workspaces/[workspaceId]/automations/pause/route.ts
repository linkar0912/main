import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { PAUSE_ALL_AUDIT_ACTION, pauseAdminWorkspaceAutomations } from "@/src/lib/admin/workspace-service";

const PauseCommand = z.object({ version: z.number().int().positive() }).strict();

export async function POST(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]/automations/pause">) {
  try {
    const { workspaceId } = await context.params;
    const input = PauseCommand.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: PAUSE_ALL_AUDIT_ACTION, targetType: "workspace", targetId: workspaceId, workspaceId });
    // The success row keeps every paused automation id; "resume" reads it back.
    const result = await runAuditedAdminMutation(guard, () => pauseAdminWorkspaceAutomations(workspaceId, input.version), { before: { version: input.version } });
    return adminJson({ data: { paused: result.paused, version: result.version } });
  } catch (error) {
    return adminRouteError(error, "workspace_pause_failed");
  }
}
