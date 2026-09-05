import { describe, expect, it } from "vitest";
import { buildSyntheticAccountInventory, buildSyntheticInventoryDigest, isApprovedSyntheticEmail } from "./synthetic-accounts";

describe("approved synthetic accounts", () => {
  it.each([
    "owner-1@example.com",
    "owner-1700000000000@example.com",
    "member-42@example.com",
    "signout-9@example.com",
    " OWNER-12@EXAMPLE.COM ",
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
    });

    expect(inventory.count).toBe(2);
    expect(inventory.excludedProtectedCount).toBe(1);
    expect(inventory.membershipCount).toBe(2);
    expect(inventory.ownedWorkspaceCount).toBe(1);
    expect(inventory.accounts.find((account) => account.userId === "synthetic-owner")?.ownedWorkspaceIds).toEqual(["workspace-1"]);
  });
});
