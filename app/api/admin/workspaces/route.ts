import { z } from "zod";

import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";
import { adminJson, adminRouteError, runAuditedAdminMutation } from "@/src/lib/admin/http";
import { requireAdminRead, requireAdminWrite } from "@/src/lib/admin/request-guard";
import { createAdminWorkspace } from "@/src/lib/admin/workspace-service";

const CreateWorkspace = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(3).max(64),
  ownerUserId: z.string().uuid(),
}).strict();

export async function GET(request: Request) {
  try {
    await requireAdminRead(request);
    const url = new URL(request.url);
    const data = await getAdminAccountsRepository().listAdminWorkspaces({
      limit: Number(url.searchParams.get("limit")) || undefined,
      cursor: url.searchParams.get("cursor"),
      search: url.searchParams.get("search") ?? undefined,
    });
    return adminJson({ data });
  } catch (error) {
    return adminRouteError(error, "workspaces_unavailable");
  }
}

export async function POST(request: Request) {
  try {
    const input = CreateWorkspace.parse(await request.json());
    const context = await requireAdminWrite(request, { action: "workspace.create", targetType: "workspace", targetId: "new" });
    const workspace = await runAuditedAdminMutation(context, () => createAdminWorkspace(input), {
      summarize: (result) => ({ id: result.id, name: result.name, slug: result.slug, status: result.status, version: result.version }),
    });
    return adminJson({ data: workspace }, { status: 201 });
  } catch (error) {
    return adminRouteError(error, "workspace_create_failed");
  }
}
