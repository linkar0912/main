import { notFound } from "next/navigation";

import { WorkspaceDetailScreen } from "@/src/components/admin/workspace-detail-screen";
import { plansForWorkspace, workspaceDetail, workspaceEntitlement } from "../../fixtures";

export default function WorkspacesWorkspaceidPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <WorkspaceDetailScreen workspace={workspaceDetail} entitlement={workspaceEntitlement} plans={plansForWorkspace} />;
}
