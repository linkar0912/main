import { adminJson, adminRouteError } from "@/src/lib/admin/http";
import { getAdminOperationsRepository } from "@/src/lib/admin/operations/repository";
import { AdminOperationFilterSchema, OperationKindSchema } from "@/src/lib/admin/operations/query-schema";
import { requireAdminRead } from "@/src/lib/admin/request-guard";

export async function GET(request: Request, context: RouteContext<"/api/admin/operations/[kind]">) {
  try {
    await requireAdminRead(request); const { kind: rawKind } = await context.params; const kind = OperationKindSchema.parse(rawKind); const url = new URL(request.url);
    const filter = AdminOperationFilterSchema.parse({ workspaceId: url.searchParams.get("workspaceId") ?? undefined, status: url.searchParams.get("status") ?? undefined, text: url.searchParams.get("text") ?? undefined, provider: url.searchParams.get("provider") ?? undefined, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined, cursor: url.searchParams.get("cursor"), limit: url.searchParams.get("limit") ?? undefined });
    return adminJson({ data: await getAdminOperationsRepository().list(kind, filter) });
  } catch (error) { return adminRouteError(error, "operations_unavailable"); }
}
