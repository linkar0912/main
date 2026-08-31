import { adminJson, adminRouteError } from "@/src/lib/admin/http";
import { requireAdminRead } from "@/src/lib/admin/request-guard";
import { listDataDeletionRequests } from "@/src/lib/admin/compliance/repository";
export async function GET(request: Request) { try { await requireAdminRead(request); const status = new URL(request.url).searchParams.get("status") ?? undefined; return adminJson({ data: await listDataDeletionRequests(status) }); } catch (error) { return adminRouteError(error, "compliance_requests_failed"); } }
