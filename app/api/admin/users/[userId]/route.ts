import { z } from "zod";

import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";
import { updateAdminUser } from "@/src/lib/admin/user-service";

const UpdateUser = z.object({ email: z.string().email(), confirmEmail: z.boolean().optional() }).strict();

export async function GET(request: Request, context: RouteContext<"/api/admin/users/[userId]">) {
  try {
    await requireAdminRead(request);
    const { userId } = await context.params;
    const user = await getAdminAccountsRepository().getAdminUser(userId);
    return user ? adminJson({ data: user }) : adminJson({ error: "user_not_found" }, { status: 404 });
  } catch (error) { return adminRouteError(error, "user_unavailable"); }
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[userId]">) {
  try {
    const { userId } = await context.params;
    const input = UpdateUser.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: "user.update", targetType: "user", targetId: userId });
    return adminJson({ data: await runAuditedAdminMutation(guard, () => updateAdminUser(userId, input)) });
  } catch (error) { return adminRouteError(error, "user_update_failed"); }
}
