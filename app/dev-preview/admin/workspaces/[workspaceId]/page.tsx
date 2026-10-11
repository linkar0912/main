import { notFound } from "next/navigation";

import { WorkspaceDetailScreen } from "@/src/components/admin/workspace-detail-screen";
import { plansForWorkspace, workspaceActivity, workspaceDetail, workspaceDetailOver, workspaceEntitlement, workspaceEntitlementOver } from "../../fixtures";

// ?state=over shows a suspended workspace over two limits; ?tab= picks a tab.
export default async function WorkspacesWorkspaceidPreview({ searchParams }: PageProps<"/dev-preview/admin/workspaces/[workspaceId]">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { state, tab } = await searchParams;
  const over = state === "over";
  return (
    <WorkspaceDetailScreen
      workspace={over ? workspaceDetailOver : workspaceDetail}
      entitlement={over ? workspaceEntitlementOver : workspaceEntitlement}
      plans={plansForWorkspace}
      activity={workspaceActivity}
      initialTab={typeof tab === "string" ? tab : undefined}
    />
  );
}
