import { z } from "zod";

import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminWrite } from "@/src/lib/admin/request-guard";
import { loadSafeWorkspaceExport, workspaceExportCsv } from "@/src/lib/admin/workspace-service";

const ExportCommand = z.object({ format: z.enum(["csv", "json"]) }).strict();

// A tenant export copies customer contact data, so it is an audited command
// with an operator reason rather than a plain download link.
export async function POST(request: Request, context: RouteContext<"/api/admin/workspaces/[workspaceId]/export">) {
  try {
    const { workspaceId } = await context.params;
    const input = ExportCommand.parse(await request.json());
    const guard = await requireAdminWrite(request, { action: "workspace.export", targetType: "workspace", targetId: workspaceId, workspaceId });
    const data = await runAuditedAdminMutation(guard, () => loadSafeWorkspaceExport(workspaceId), {
      summarize: (result) => ({
        format: input.format,
        members: result.members.length,
        automations: result.automations.length,
        contacts: result.contacts.length,
      }),
    });
    const filename = `linkar-workspace-${workspaceId}.${input.format}`;
    const headers = {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
    };
    if (input.format === "csv") {
      return new Response(workspaceExportCsv(data), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
    }
    const response = adminJson({ data });
    response.headers.set("Content-Disposition", headers["Content-Disposition"]);
    return response;
  } catch (error) {
    return adminRouteError(error, "workspace_export_failed");
  }
}
