import { createId } from "@/src/lib/id";
import type { AutomationRepository, InvitationRecord } from "@/src/lib/repository";

/**
 * Turns a resolved invitation (or its absence) into a workspace membership
 * for a brand-new account. Shared by password signup and OAuth signup so a
 * new account always lands in exactly one workspace, the same way either
 * path chooses it.
 */
export async function provisionWorkspace(params: {
  email: string;
  userId: string;
  invitation: InvitationRecord | null;
  repository: Pick<AutomationRepository, "ensureWorkspace" | "acceptInvitation">;
}): Promise<string> {
  if (params.invitation) {
    await params.repository.acceptInvitation(params.invitation.id, new Date().toISOString(), params.userId);
    return params.invitation.workspaceId;
  }

  const workspaceId = createId("workspace");
  await params.repository.ensureWorkspace(workspaceId, params.email, params.userId);
  return workspaceId;
}
