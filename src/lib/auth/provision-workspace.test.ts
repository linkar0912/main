import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import { hashToken } from "@/src/lib/auth/tokens";
import { provisionWorkspace } from "@/src/lib/auth/provision-workspace";

describe("provisionWorkspace", () => {
  it("creates a fresh workspace owned by the email when there is no invitation", async () => {
    const repository = createMemoryRepository();
    const workspaceId = await provisionWorkspace({
      email: "owner@example.com",
      userId: "11111111-1111-4111-8111-111111111111",
      invitation: null,
      repository,
    });

    expect(await repository.findWorkspaceIdByMemberEmail("owner@example.com")).toBe(workspaceId);
    expect(await repository.getMemberRole(workspaceId, "owner@example.com")).toBe("OWNER");
    expect(await repository.listWorkspaceMembershipsByUserId("11111111-1111-4111-8111-111111111111"))
      .toHaveLength(1);
  });

  it("joins the invitation's workspace and marks it accepted, without creating a new workspace", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("ws_existing", "founder@example.com");
    const invitation = await repository.createInvitation({
      workspaceId: "ws_existing",
      email: "invited@example.com",
      role: "MEMBER",
      tokenHash: hashToken("raw-token"),
      invitedByUserId: "u_1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const workspaceId = await provisionWorkspace({
      email: "invited@example.com",
      userId: "22222222-2222-4222-8222-222222222222",
      invitation,
      repository,
    });

    expect(workspaceId).toBe("ws_existing");
    const stored = await repository.findInvitationByTokenHash(hashToken("raw-token"));
    expect(stored?.acceptedAt).toBeTruthy();
    expect(await repository.listWorkspaceMembershipsByUserId("22222222-2222-4222-8222-222222222222"))
      .toContainEqual(expect.objectContaining({ workspaceId: "ws_existing", role: "MEMBER" }));
  });
});
