import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import { hashToken } from "@/src/lib/auth/tokens";
import { completeOAuthSignIn, completeOAuthSignInResult } from "./complete-oauth-signin";

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

describe("completeOAuthSignInResult (refuseInvalidInvite)", () => {
  async function inviteFor(email: string) {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("ws_inviter", "founder@example.com");
    await repository.createInvitation({
      workspaceId: "ws_inviter",
      email,
      role: "MEMBER",
      tokenHash: hashToken("raw-token"),
      invitedByUserId: "u_1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    return repository;
  }

  it("refuses a new account whose invitation was sent to another address, without provisioning a workspace", async () => {
    const repository = await inviteFor("work@company.com");
    const ensureWorkspace = vi.spyOn(repository, "ensureWorkspace");

    const result = await completeOAuthSignInResult({
      email: "person@example.com",
      userId: "user-personal",
      inviteRaw: "raw-token",
      repository,
      refuseInvalidInvite: true,
    });

    expect(result).toEqual({ status: "invite-invalid" });
    expect(ensureWorkspace).not.toHaveBeenCalled();
    expect(await repository.findWorkspaceIdByMemberEmail("person@example.com")).toBeNull();
    expect((await repository.findInvitationByTokenHash(hashToken("raw-token")))?.acceptedAt).toBeFalsy();
  });

  it("still signs in an existing member whatever invite came along", async () => {
    const repository = await inviteFor("work@company.com");
    await repository.ensureWorkspace("ws_own", "person@example.com", "user-personal");

    const result = await completeOAuthSignInResult({
      email: "person@example.com",
      userId: "user-personal",
      inviteRaw: "raw-token",
      repository,
      refuseInvalidInvite: true,
    });

    expect(result).toEqual({ status: "signed-in", workspaceId: "ws_own" });
  });

  it("accepts a matching invitation and provisions when there is no invite at all", async () => {
    const repository = await inviteFor("person@example.com");
    expect(await completeOAuthSignInResult({ email: "person@example.com", userId: "user-1", inviteRaw: "raw-token", repository, refuseInvalidInvite: true }))
      .toEqual({ status: "signed-in", workspaceId: "ws_inviter" });

    const fresh = await completeOAuthSignInResult({ email: "fresh@example.com", userId: "user-2", inviteRaw: "", repository, refuseInvalidInvite: true });
    expect(fresh.status).toBe("signed-in");
    expect(await repository.findWorkspaceIdByMemberEmail("fresh@example.com")).toBe(fresh.status === "signed-in" ? fresh.workspaceId : null);
  });

  it("leaves the default completeOAuthSignIn provisioning a fresh workspace for an invalid invite", async () => {
    const repository = await inviteFor("work@company.com");
    const ensureWorkspace = vi.spyOn(repository, "ensureWorkspace");

    const workspaceId = await completeOAuthSignIn({ email: "person@example.com", userId: "user-personal", inviteRaw: "raw-token", repository });

    expect(ensureWorkspace).toHaveBeenCalledTimes(1);
    expect(await repository.findWorkspaceIdByMemberEmail("person@example.com")).toBe(workspaceId);
  });
});
