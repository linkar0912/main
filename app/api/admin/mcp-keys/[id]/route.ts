import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { revokeAdminMcpKey } from "@/src/lib/admin/mcp/keys";
import { requireAdminSessionWrite } from "@/src/lib/admin/request-guard";

export async function DELETE(request: Request, context: RouteContext<"/api/admin/mcp-keys/[id]">) {
  try {
    const { id } = await context.params;
    const guard = await requireAdminSessionWrite(request, { action: "mcp_key.revoke", targetType: "mcp_key", targetId: id });
    return adminJson({ data: await runAuditedAdminMutation(guard, () => revokeAdminMcpKey({ id, ownerUserId: guard.owner.userId })) });
  } catch (error) { return adminRouteError(error, "mcp_key_revoke_failed"); }
}
