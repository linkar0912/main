import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { resumeAdminWorkspaceAutomations } from "@/src/lib/admin/workspace-service";

const ResumeCommand = z.object({ version: z.number().int().positive() }).strict();

export async function POST(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]/automations/resume">) {
  try {
    const { workspaceId } = await context.params;
    const input = ResumeCommand.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: "workspace.automations.resume_paused", targetType: "workspace", targetId: workspaceId, workspaceId });
    const result = await runAuditedAdminMutation(guard, () => resumeAdminWorkspaceAutomations(workspaceId, input.version), { before: { version: input.version } });
    return adminJson({ data: { resumed: result.resumed, skipped: result.skipped, version: result.version } });
  } catch (error) {
    return adminRouteError(error, "workspace_resume_failed");
  }
}
