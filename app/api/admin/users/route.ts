import { z } from "zod";

import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";
import { createAdminUser } from "@/src/lib/admin/user-service";

const CreateUser = z.object({ email: z.string().email(), mode: z.enum(["INVITE", "CREATE"]), confirmed: z.boolean().optional() }).strict();

export async function GET(request: Request) {
  try {
    await requireAdminRead(request);
    const url = new URL(request.url);
    return adminJson({ data: await getAdminAccountsRepository().listAdminUsers({ limit: Number(url.searchParams.get("limit")) || undefined, cursor: url.searchParams.get("cursor"), search: url.searchParams.get("search") ?? undefined }) });
  } catch (error) { return adminRouteError(error, "users_unavailable"); }
}

export async function POST(request: Request) {
  try {
    const input = CreateUser.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: `user.${input.mode.toLowerCase()}`, targetType: "user", targetId: input.email.toLowerCase() });
    const user = await runAuditedAdminMutation(guard, () => createAdminUser(input));
    return adminJson({ data: user }, { status: 201 });
  } catch (error) { return adminRouteError(error, "user_create_failed"); }
}
