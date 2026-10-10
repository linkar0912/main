import { z } from "zod";

import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";
import { userAuditSnapshot } from "@/src/lib/admin/audit-snapshots";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { isAdminUserId } from "@/src/lib/admin/ids";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";
import { updateAdminUser } from "@/src/lib/admin/user-service";

const UpdateUser = z.object({ email: z.string().email(), confirmEmail: z.boolean().optional() }).strict();

export async function GET(request: Request, context: RouteContext<"/api/admin/users/[userId]">) {
  try {
    await requireAdminRead(request);
    const { userId } = await context.params;
    const user = isAdminUserId(userId) ? await getAdminAccountsRepository().getAdminUser(userId) : null;
    return user ? adminJson({ data: user }) : adminJson({ error: "user_not_found" }, { status: 404 });
  } catch (error) { return adminRouteError(error, "user_unavailable"); }
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[userId]">) {
  try {
    const { userId } = await context.params;
    if (!isAdminUserId(userId)) return adminJson({ error: "user_not_found" }, { status: 404 });
    const guard = await requireAdminWrite(request, { action: "user.update", targetType: "user", targetId: userId });
    const input = UpdateUser.parse(await request.json());
    const before = await userAuditSnapshot(userId);
    return adminJson({ data: await runAuditedAdminMutation(guard, () => updateAdminUser(userId, input), { before: before && { email: before.email } }) });
  } catch (error) { return adminRouteError(error, "user_update_failed"); }
}
