import { describe, expect, it } from "vitest";
import { buildSyntheticAccountInventory, buildSyntheticInventoryDigest, isApprovedSyntheticEmail } from "./synthetic-accounts";

describe("approved synthetic accounts", () => {
  it.each([
    "owner-1@example.com",
    "owner-1700000000000@example.com",
    "member-42@example.com",
    "signout-9@example.com",
    " OWNER-12@EXAMPLE.COM ",
    "tier1-verify-1787398379@example.com",
    "tier1-verify2-1787398423@example.com",
    "final-verify2-1787416218@example.com",
    "clear2-verify-1787419275@example.com",
    "engine-verify-1828724811@example.com",
    "gallery-verify-178417563@example.com",
    "probe-deploy-1787394707@example.com",
    "workspace-preview@linkar.local",
  ])("accepts only the approved generated shape: %s", (email) => {
    expect(isApprovedSyntheticEmail(email)).toBe(true);
  });

  it.each([
    "owner-real@example.com",
    "owner-12@example.org",
    "xowner-12@example.com",
    "owner-12+tag@example.com",
    "owner-@example.com",
    "member@example.com",
    "signout-2@sub.example.com",
    "person@gmail.com",
    "",
    "verify-1@example.com",
    "tier1-verify@example.com",
    "tier1-verify-1@example.org",
    "someone-verify-1@example.com",
    "probe-deploy@example.com",
    "probe-deploy-1@gmail.com",
    "workspace-preview@linkar.in",
    "x-workspace-preview@linkar.local",
    "workspace-preview-2@linkar.local",
  ])("preserves every near miss or genuine address: %s", (email) => {
    expect(isApprovedSyntheticEmail(email)).toBe(false);
  });

  it("creates a stable digest independent of account order", () => {
    const accounts = [
      { userId: "b", email: "member-2@example.com", membershipCount: 0, ownedWorkspaceIds: [] },
      { userId: "a", email: "owner-1@example.com", membershipCount: 1, ownedWorkspaceIds: ["w1"] },
    ];

    expect(buildSyntheticInventoryDigest(accounts)).toBe(buildSyntheticInventoryDigest([...accounts].reverse()));
  });

  it("paginates Auth, excludes protected owners, and joins memberships by user id", async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      id: `ignored-${index}`,
      email: `real-${index}@example.com`,
    }));
    firstPage[0] = { id: "synthetic-owner", email: "owner-1@example.com" };
    firstPage[1] = { id: "protected", email: "member-2@example.com" };
    const listMemberships = async () => [
      { userId: "synthetic-owner", workspaceId: "workspace-1", role: "OWNER" },
      { userId: "synthetic-owner", workspaceId: "workspace-2", role: "MEMBER" },
    ];

    const inventory = await buildSyntheticAccountInventory({
      platformOwnerUserIds: ["PROTECTED"],
      listAuthUsersPage: async (page) => page === 1 ? firstPage : [{ id: "synthetic-member", email: "member-3@example.com" }],
      listMemberships,
      listOwnedWorkspaceMemberships: async () => [
        { userId: "synthetic-owner", workspaceId: "workspace-1", role: "OWNER" },
      ],
    });

    expect(inventory.count).toBe(2);
    expect(inventory.excludedProtectedCount).toBe(1);
    expect(inventory.membershipCount).toBe(2);
    expect(inventory.ownedWorkspaceCount).toBe(1);
    expect(inventory.unsafeOwnedWorkspaceCount).toBe(0);
    expect(inventory.accounts.find((account) => account.userId === "synthetic-owner")?.ownedWorkspaceIds).toEqual(["workspace-1"]);
  });

  it("flags a synthetic-owned workspace shared with any non-synthetic identity", async () => {
    const inventory = await buildSyntheticAccountInventory({
      platformOwnerUserIds: [],
      listAuthUsersPage: async () => [{ id: "synthetic-owner", email: "owner-1@example.com" }],
      listMemberships: async () => [
        { userId: "synthetic-owner", workspaceId: "workspace-1", role: "OWNER" },
      ],
      listOwnedWorkspaceMemberships: async () => [
        { userId: "synthetic-owner", workspaceId: "workspace-1", role: "OWNER" },
        { userId: "genuine-user", workspaceId: "workspace-1", role: "MEMBER" },
      ],
    });

    expect(inventory.unsafeOwnedWorkspaceCount).toBe(1);
  });

  it("joins a workspace linked by email only to its synthetic account", async () => {
    // Early generated accounts never signed in, so their membership row still has no user id.
    const requested: Array<{ userIds: string[]; emails: string[] }> = [];
    const inventory = await buildSyntheticAccountInventory({
      platformOwnerUserIds: [],
      listAuthUsersPage: async () => [
        { id: "early-test", email: "Tier1-Verify-1787398379@example.com" },
        { id: "linked-owner", email: "owner-1@example.com" },
      ],
      listMemberships: async (userIds, emails) => {
        requested.push({ userIds, emails });
        return [
          { userId: null, email: "tier1-verify-1787398379@EXAMPLE.com", workspaceId: "workspace-early", role: "OWNER" },
          { userId: "linked-owner", email: "owner-1@example.com", workspaceId: "workspace-linked", role: "OWNER" },
        ];
      },
      listOwnedWorkspaceMemberships: async () => [
        { userId: null, email: "tier1-verify-1787398379@example.com", workspaceId: "workspace-early", role: "OWNER" },
        { userId: "linked-owner", email: "owner-1@example.com", workspaceId: "workspace-linked", role: "OWNER" },
      ],
    });

    expect(requested).toEqual([{ userIds: ["early-test", "linked-owner"], emails: ["tier1-verify-1787398379@example.com", "owner-1@example.com"] }]);
    expect(inventory.accounts.find((account) => account.userId === "early-test")).toMatchObject({ membershipCount: 1, ownedWorkspaceIds: ["workspace-early"] });
    expect(inventory.ownedWorkspaceCount).toBe(2);
    expect(inventory.unsafeOwnedWorkspaceCount).toBe(0);
  });

  it("flags a synthetic-owned workspace with an email-only member who is not synthetic", async () => {
    const inventory = await buildSyntheticAccountInventory({
      platformOwnerUserIds: [],
      listAuthUsersPage: async () => [{ id: "synthetic-owner", email: "owner-1@example.com" }],
      listMemberships: async () => [
        { userId: "synthetic-owner", email: "owner-1@example.com", workspaceId: "workspace-1", role: "OWNER" },
      ],
      listOwnedWorkspaceMemberships: async () => [
        { userId: "synthetic-owner", email: "owner-1@example.com", workspaceId: "workspace-1", role: "OWNER" },
        { userId: null, email: "invited.person@gmail.com", workspaceId: "workspace-1", role: "MEMBER" },
      ],
    });

    expect(inventory.unsafeOwnedWorkspaceCount).toBe(1);
  });

  it("does not attribute an email-only membership to a protected owner's excluded account", async () => {
    const inventory = await buildSyntheticAccountInventory({
      platformOwnerUserIds: ["protected"],
      listAuthUsersPage: async () => [{ id: "protected", email: "owner-9@example.com" }],
      listMemberships: async () => [
        { userId: null, email: "owner-9@example.com", workspaceId: "workspace-9", role: "OWNER" },
      ],
    });

    expect(inventory.count).toBe(0);
    expect(inventory.ownedWorkspaceCount).toBe(0);
  });
});
