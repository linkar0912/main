import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import { hashToken } from "@/src/lib/auth/tokens";
import { resolveInvitation } from "@/src/lib/auth/invitations";

describe("resolveInvitation", () => {
  it("returns none when no invite token is given", async () => {
    const repository = createMemoryRepository();
    const result = await resolveInvitation({ inviteRaw: "", email: "a@example.com", repository });
    expect(result).toEqual({ status: "none" });
  });

  it("returns invalid when the token matches no invitation", async () => {
    const repository = createMemoryRepository();
    const result = await resolveInvitation({ inviteRaw: "bogus-token", email: "a@example.com", repository });
    expect(result).toEqual({ status: "invalid" });
  });

  it("returns invalid when the invitation email does not match", async () => {
    const repository = createMemoryRepository();
    const raw = "raw-token";
    await repository.createInvitation({
      workspaceId: "ws_1",
      email: "invited@example.com",
      role: "MEMBER",
      tokenHash: hashToken(raw),
      invitedByUserId: "u_1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const result = await resolveInvitation({ inviteRaw: raw, email: "someone-else@example.com", repository });
    expect(result).toEqual({ status: "invalid" });
  });

  it("returns invalid when the invitation is expired", async () => {
    const repository = createMemoryRepository();
    const raw = "raw-token";
    await repository.createInvitation({
      workspaceId: "ws_1",
      email: "invited@example.com",
      role: "MEMBER",
      tokenHash: hashToken(raw),
      invitedByUserId: "u_1",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const result = await resolveInvitation({ inviteRaw: raw, email: "invited@example.com", repository });
    expect(result).toEqual({ status: "invalid" });
  });

  it("returns invalid when the invitation was already accepted", async () => {
    const repository = createMemoryRepository();
    const raw = "raw-token";
    const invitation = await repository.createInvitation({
      workspaceId: "ws_1",
      email: "invited@example.com",
      role: "MEMBER",
      tokenHash: hashToken(raw),
      invitedByUserId: "u_1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await repository.acceptInvitation(invitation.id, new Date().toISOString());
    const result = await resolveInvitation({ inviteRaw: raw, email: "invited@example.com", repository });
    expect(result).toEqual({ status: "invalid" });
  });

  it("returns valid with the invitation when the token matches an unexpired, unaccepted invite for the email", async () => {
    const repository = createMemoryRepository();
    const raw = "raw-token";
    const invitation = await repository.createInvitation({
      workspaceId: "ws_1",
      email: "invited@example.com",
      role: "MEMBER",
      tokenHash: hashToken(raw),
      invitedByUserId: "u_1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const result = await resolveInvitation({ inviteRaw: raw, email: "invited@example.com", repository });
    expect(result).toEqual({ status: "valid", invitation });
  });
});
