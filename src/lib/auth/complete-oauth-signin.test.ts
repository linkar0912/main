import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import { hashToken } from "@/src/lib/auth/tokens";
import { completeOAuthSignIn } from "./complete-oauth-signin";

describe("completeOAuthSignIn", () => {
  it("does nothing when the email already belongs to a workspace", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("ws_existing", "person@example.com");

    const workspaceId = await completeOAuthSignIn({ email: "person@example.com", userId: "user-existing", inviteRaw: "", repository });

    expect(workspaceId).toBe("ws_existing");
  });

  it("accepts a valid invite for a first-time sign-in", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("ws_inviter", "founder@example.com");
    const invitation = await repository.createInvitation({
      workspaceId: "ws_inviter",
      email: "invited@example.com",
      role: "MEMBER",
      tokenHash: hashToken("raw-token"),
      invitedByUserId: "u_1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const workspaceId = await completeOAuthSignIn({
      email: "invited@example.com",
      userId: "user-invited",
      inviteRaw: "raw-token",
      repository,
    });

    expect(workspaceId).toBe("ws_inviter");
    const stored = await repository.findInvitationByTokenHash(hashToken("raw-token"));
    expect(stored?.acceptedAt).toBeTruthy();
    void invitation;
  });

  it("provisions a fresh workspace for a first-time sign-in with no invite", async () => {
    const repository = createMemoryRepository();

    const workspaceId = await completeOAuthSignIn({ email: "fresh@example.com", userId: "user-fresh", inviteRaw: "", repository });

    expect(await repository.findWorkspaceIdByMemberEmail("fresh@example.com")).toBe(workspaceId);
  });

  it("falls back to a fresh workspace when the invite token is invalid, rather than blocking sign-in", async () => {
    const repository = createMemoryRepository();

    const workspaceId = await completeOAuthSignIn({ email: "fresh@example.com", userId: "user-fresh", inviteRaw: "bogus", repository });

    expect(await repository.findWorkspaceIdByMemberEmail("fresh@example.com")).toBe(workspaceId);
  });
});
