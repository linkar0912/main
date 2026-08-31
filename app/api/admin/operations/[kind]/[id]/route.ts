import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { getAdminOperationsRepository } from "@/src/lib/admin/operations/repository";
import { OperationKindSchema } from "@/src/lib/admin/operations/query-schema";
import { AdminOperationCommandSchema, executeAdminOperation } from "@/src/lib/admin/operations/service";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";

export async function GET(request: Request, context: RouteContext<"/api/admin/operations/[kind]/[id]">) {
  try { await requireAdminRead(request); const { kind: rawKind, id } = await context.params; const kind = OperationKindSchema.parse(rawKind); const operation = await getAdminOperationsRepository().get(kind, id); return operation ? adminJson({ data: operation }) : adminJson({ error: "operation_not_found" }, { status: 404 }); }
  catch (error) { return adminRouteError(error, "operation_unavailable"); }
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/operations/[kind]/[id]">) {
  try {
    const { kind: rawKind, id } = await context.params; const kind = OperationKindSchema.parse(rawKind); const command = AdminOperationCommandSchema.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: `operation.${kind}.${command.action}`, targetType: kind, targetId: id });
    const result = await runAuditedAdminMutation(guard, () => executeAdminOperation(kind, id, command, guard.owner.userId), { summarize: (value) => typeof value === "object" && value !== null && "csv" in value ? { id, kind, action: command.action, exported: true } : value });
    if (typeof result === "object" && result !== null && "csv" in result && typeof result.csv === "string") return new Response(result.csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="contact-${id}.csv"`, "cache-control": "private, no-store" } });
    return adminJson({ data: result });
  } catch (error) { return adminRouteError(error, "operation_command_failed"); }
}
