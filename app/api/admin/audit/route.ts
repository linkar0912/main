import { z } from "zod";
import { adminJson, adminRouteError } from "@/src/lib/admin/http";
import { requireAdminRead } from "@/src/lib/admin/request-guard";
import { listAdminAuditEvents } from "@/src/lib/admin/audit/repository";

const Phase = z.enum(["ATTEMPT", "SUCCESS", "FAILURE"]);
export async function GET(request: Request) { try { await requireAdminRead(request); const params = new URL(request.url).searchParams; return adminJson({ data: await listAdminAuditEvents({ actor: params.get("actor") ?? undefined, action: params.get("action") ?? undefined, targetType: params.get("targetType") ?? undefined, targetId: params.get("targetId") ?? undefined, workspaceId: params.get("workspaceId") ?? undefined, requestId: params.get("requestId") ?? undefined, phase: params.get("phase") ? Phase.parse(params.get("phase")) : undefined, origin: params.get("origin") ?? undefined, from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, cursor: params.get("cursor") }) }); } catch (error) { return adminRouteError(error, "audit_query_failed"); } }
