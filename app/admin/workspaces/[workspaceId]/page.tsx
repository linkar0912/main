import { AdminWorkspaceError } from "@/src/lib/admin/workspace-service";
import { notFound } from "next/navigation";

import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { WorkspaceDetailScreen } from "@/src/components/admin/workspace-detail-screen";
import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";
import { listAdminPlans, loadAdminWorkspaceEntitlement } from "@/src/lib/admin/plan-service";

async function WorkspaceData({ workspaceId }: { workspaceId: string }) {
  const workspace = await getAdminAccountsRepository().getAdminWorkspace(workspaceId);
  if (!workspace) notFound();
  const [entitlement, plans] = await Promise.all([
    loadAdminWorkspaceEntitlement(workspaceId).catch((error: unknown) => {
      if (error instanceof AdminWorkspaceError && error.code === "workspace_entitlement_missing") return undefined;
      throw error;
    }),
    listAdminPlans(),
  ]);
  return <WorkspaceDetailScreen key={`${workspace.id}:${workspace.version}:${entitlement?.version ?? "missing"}`} workspace={workspace} entitlement={entitlement} plans={plans.map(({ id, key, name, isActive }) => ({ id, key, name, isActive }))} />;
}

export default async function AdminWorkspacePage({ params }: PageProps<"/admin/workspaces/[workspaceId]">) {
  const { workspaceId } = await params;
  return <AdminRouteGuard><WorkspaceData workspaceId={workspaceId} /></AdminRouteGuard>;
}
