import { z } from "zod";

import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";
import { updateAdminWorkspace } from "@/src/lib/admin/workspace-service";

const UpdateWorkspace = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(3).max(64).optional(),
  version: z.number().int().positive(),
}).strict().refine((input) => input.name !== undefined || input.slug !== undefined, "change_required");

export async function GET(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]">) {
  try {
    await requireAdminRead(request);
    const { workspaceId } = await context.params;
    const workspace = await getAdminAccountsRepository().getAdminWorkspace(workspaceId);
    return workspace ? adminJson({ data: workspace }) : adminJson({ error: "workspace_not_found" }, { status: 404 });
  } catch (error) {
    return adminRouteError(error, "workspace_unavailable");
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]">) {
  try {
    const { workspaceId } = await context.params;
    const input = UpdateWorkspace.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: "workspace.update", targetType: "workspace", targetId: workspaceId });
    const workspace = await runAuditedAdminMutation(guard, () => updateAdminWorkspace(workspaceId, input), {
      summarize: (result) => ({ id: result.id, name: result.name, slug: result.slug, status: result.status, version: result.version }),
    });
    return adminJson({ data: workspace });
  } catch (error) {
    return adminRouteError(error, "workspace_update_failed");
  }
}
