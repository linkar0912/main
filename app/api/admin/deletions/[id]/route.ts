import { z } from "zod";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";
import { getDeletionJob } from "@/src/lib/admin/deletion/repository";
import { changeDeletionJob } from "@/src/lib/admin/deletion/service";

const Input = z.object({ action: z.enum(["cancel", "retry"]) }).strict();

export async function GET(request: Request, context: RouteContext<"/api/admin/deletions/[id]">) {
  try { await requireAdminRead(request); const { id } = await context.params; const data = await getDeletionJob(id); return data ? adminJson({ data }) : adminJson({ error: "deletion_job_not_found" }, { status: 404 }); }
  catch (error) { return adminRouteError(error, "deletion_status_failed"); }
}

export async function PATCH(request: Request, route: RouteContext<"/api/admin/deletions/[id]">) {
  try {
    const { id } = await route.params; const input = Input.parse(await request.json());
    const context = await requireAdminWrite(request, { action: `deletion.${input.action}`, targetType: "deletion_job", targetId: id });
    return adminJson({ data: await runAuditedAdminMutation(context, () => changeDeletionJob(id, input.action, context)) });
  } catch (error) { return adminRouteError(error, "deletion_command_failed"); }
}
