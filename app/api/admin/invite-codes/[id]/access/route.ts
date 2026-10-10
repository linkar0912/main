import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { endAdminPremiumAccess } from "@/src/lib/admin/plan-service";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";

/** Ends the premium access a redeemed invite code granted, ahead of its expiry. */
export async function DELETE(request: Request, context: RouteContext<"/api/admin/invite-codes/[id]/access">) {
  try {
    const { id } = await context.params;
    const guard = await requireAdminWrite(request, { action: "premium_invite.end_access", targetType: "premium_invite", targetId: id });
    return adminJson({ data: await runAuditedAdminMutation(guard, () => endAdminPremiumAccess(id)) });
  } catch (error) {
    return adminRouteError(error, "premium_access_end_failed");
  }
}
