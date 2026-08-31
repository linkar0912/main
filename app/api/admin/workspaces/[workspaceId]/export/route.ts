import { adminJson, adminRouteError } from "@/src/lib/admin/http";
import { requireAdminRead } from "@/src/lib/admin/request-guard";
import { loadSafeWorkspaceExport, workspaceExportCsv } from "@/src/lib/admin/workspace-service";

export async function GET(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]/export">) {
  try {
    await requireAdminRead(request);
    const { workspaceId } = await context.params;
    const data = await loadSafeWorkspaceExport(workspaceId);
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    if (format === "csv") {
      return new Response(workspaceExportCsv(data), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="linkar-workspace-${workspaceId}.csv"`,
        },
      });
    }
    if (format !== "json") return adminJson({ error: "invalid_format" }, { status: 422 });
    return adminJson({ data });
  } catch (error) {
    return adminRouteError(error, "workspace_export_failed");
  }
}
