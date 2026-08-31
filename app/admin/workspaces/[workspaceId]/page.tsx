import { notFound } from "next/navigation";

import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { WorkspaceDetailScreen } from "@/src/components/admin/workspace-detail-screen";
import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";

async function WorkspaceData({ workspaceId }: { workspaceId: string }) {
  const workspace = await getAdminAccountsRepository().getAdminWorkspace(workspaceId);
  if (!workspace) notFound();
  return <WorkspaceDetailScreen workspace={workspace} />;
}

export default async function AdminWorkspacePage({ params }: PageProps<"/admin/workspaces/[workspaceId]">) {
  const { workspaceId } = await params;
  return <AdminRouteGuard><WorkspaceData workspaceId={workspaceId} /></AdminRouteGuard>;
}
