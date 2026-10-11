import { AdminWorkspaceError } from "@/src/lib/admin/workspace-service";
import { notFound } from "next/navigation";

import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { WorkspaceDetailScreen } from "@/src/components/admin/workspace-detail-screen";
import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";
import { listAdminAuditEvents } from "@/src/lib/admin/audit/repository";
import { listAdminPlans, loadAdminWorkspaceEntitlement } from "@/src/lib/admin/plan-service";

async function WorkspaceData({ workspaceId, tab }: { workspaceId: string; tab?: string }) {
  const workspace = await getAdminAccountsRepository().getAdminWorkspace(workspaceId);
  if (!workspace) notFound();
  const [entitlement, plans, activity] = await Promise.all([
    loadAdminWorkspaceEntitlement(workspaceId).catch((error: unknown) => {
      if (error instanceof AdminWorkspaceError && error.code === "workspace_entitlement_missing") return undefined;
      throw error;
    }),
    listAdminPlans(),
    // The Activity tab is optional: if the audit log can't be read, the page
    // still loads and simply leaves that tab out.
    listAdminAuditEvents({ workspaceId, limit: 20 }).then((page) => page.items).catch((error: unknown) => {
      console.error("admin_workspace_activity_unavailable", error instanceof Error ? error.message : error);
      return undefined;
    }),
  ]);
  return (
    <WorkspaceDetailScreen
      key={`${workspace.id}:${workspace.version}:${entitlement?.version ?? "missing"}`}
      workspace={workspace}
      entitlement={entitlement}
      plans={plans.map(({ id, key, name, isActive }) => ({ id, key, name, isActive }))}
      activity={activity?.map(({ id, phase, actorEmail, action, reason, errorCode, createdAt }) => ({ id, phase, actorEmail, action, reason, errorCode, createdAt: createdAt.toISOString() }))}
      initialTab={tab}
    />
  );
}

export default async function AdminWorkspacePage({ params, searchParams }: PageProps<"/admin/workspaces/[workspaceId]">) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  const tab = typeof query.tab === "string" ? query.tab : undefined;
  return <AdminRouteGuard><WorkspaceData workspaceId={workspaceId} tab={tab} /></AdminRouteGuard>;
}
