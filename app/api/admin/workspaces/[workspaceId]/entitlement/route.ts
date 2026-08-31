import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { loadAdminWorkspaceEntitlement, updateAdminWorkspaceEntitlement } from "@/src/lib/admin/plan-service";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";
import { EntitlementOverridesSchema } from "@/src/lib/entitlements/types";

const UpdateEntitlement = z.object({ planId: z.string().min(1), overrides: EntitlementOverridesSchema, version: z.number().int().positive() }).strict();

export async function GET(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]/entitlement">) {
  try { await requireAdminRead(request); const { workspaceId } = await context.params; return adminJson({ data: await loadAdminWorkspaceEntitlement(workspaceId) }); }
  catch (error) { return adminRouteError(error, "workspace_entitlement_unavailable"); }
}
export async function PATCH(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]/entitlement">) {
  try { const { workspaceId } = await context.params; const input = UpdateEntitlement.parse(await request.json()); const guard = await requireAdminWrite(request, { action: "workspace.entitlement.update", targetType: "workspace", targetId: workspaceId }); return adminJson({ data: await runAuditedAdminMutation(guard, () => updateAdminWorkspaceEntitlement(workspaceId, input)) }); }
  catch (error) { return adminRouteError(error, "workspace_entitlement_update_failed"); }
}
