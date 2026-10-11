import { notFound } from "next/navigation";

import { WorkspaceDetailScreen } from "@/src/components/admin/workspace-detail-screen";
import { plansForWorkspace, workspaceActivity, workspaceDetail, workspaceDetailEmpty, workspaceDetailLong, workspaceDetailOver, workspaceEntitlement, workspaceEntitlementOver } from "../../fixtures";

// ?state=over shows a suspended workspace over two limits, ?state=empty a new
// workspace with nobody in it, ?state=long long names; ?tab= picks a tab.
export default async function WorkspacesWorkspaceidPreview({ searchParams }: PageProps<"/dev-preview/admin/workspaces/[workspaceId]">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { state, tab } = await searchParams;
  const over = state === "over";
  const workspace = over ? workspaceDetailOver : state === "empty" ? workspaceDetailEmpty : state === "long" ? workspaceDetailLong : workspaceDetail;
  return (
    <WorkspaceDetailScreen
      workspace={workspace}
      entitlement={over ? workspaceEntitlementOver : workspaceEntitlement}
      plans={plansForWorkspace}
      activity={state === "empty" ? [] : workspaceActivity}
      initialTab={typeof tab === "string" ? tab : undefined}
    />
  );
}
