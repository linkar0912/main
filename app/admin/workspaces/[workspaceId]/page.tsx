import { notFound } from "next/navigation";

import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { WorkspaceDetailScreen } from "@/src/components/admin/workspace-detail-screen";
import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";
import { listAdminPlans, loadAdminWorkspaceEntitlement } from "@/src/lib/admin/plan-service";

async function WorkspaceData({ workspaceId }: { workspaceId: string }) {
  const [workspace, entitlement, plans] = await Promise.all([
    getAdminAccountsRepository().getAdminWorkspace(workspaceId),
    loadAdminWorkspaceEntitlement(workspaceId),
    listAdminPlans(),
  ]);
  if (!workspace) notFound();
  return <WorkspaceDetailScreen workspace={workspace} entitlement={entitlement} plans={plans.map(({ id, key, name, isActive }) => ({ id, key, name, isActive }))} />;
}

export default async function AdminWorkspacePage({ params }: PageProps<"/admin/workspaces/[workspaceId]">) {
  const { workspaceId } = await params;
  return <AdminRouteGuard><WorkspaceData workspaceId={workspaceId} /></AdminRouteGuard>;
}
