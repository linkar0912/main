import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { sendAdminPasswordReset } from "@/src/lib/admin/user-service";

export async function POST(request: Request, context: RouteContext<"/api/admin/users/[userId]/reset">) {
  try {
    const { userId } = await context.params;
    await request.json();
    const guard = await requireAdminWrite(request, { action: "user.password_reset", targetType: "user", targetId: userId });
    return adminJson({ data: await runAuditedAdminMutation(guard, () => sendAdminPasswordReset(userId), { summarize: () => ({ userId, sent: true }) }) });
  } catch (error) { return adminRouteError(error, "password_reset_failed"); }
}
