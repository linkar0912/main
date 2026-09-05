import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { getPremiumInviteService } from "@/src/lib/billing/premium-invite";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requireAdminWrite(request, { action: "premium_invite.revoke", targetType: "premium_invite", targetId: id });
    const data = await runAuditedAdminMutation(guard, () => getPremiumInviteService().revoke(id));
    return adminJson({ data });
  } catch (error) {
    return adminRouteError(error, "invite_code_revoke_failed");
  }
}
