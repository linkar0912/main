import { describe, expect, it } from "vitest";
import {
  assertSyntheticCleanupInventory,
  canDeleteSyntheticAuthUser,
} from "./synthetic-cleanup-safety";

const stored = [
  { userId: "user_1", email: "owner-1@example.com", membershipCount: 1, ownedWorkspaceIds: ["workspace_1"] },
];

describe("synthetic cleanup execution safety", () => {
  it("accepts only an unchanged, isolated inventory", () => {
    expect(() => assertSyntheticCleanupInventory("a".repeat(64), {
      digest: "a".repeat(64),
      unsafeOwnedWorkspaceCount: 0,
    })).not.toThrow();
  });

  it("rejects inventory drift before the irreversible boundary", () => {
    expect(() => assertSyntheticCleanupInventory("a".repeat(64), {
      digest: "b".repeat(64),
      unsafeOwnedWorkspaceCount: 0,
    })).toThrow("impact_changed");
  });

  it("rejects a workspace that gained a genuine member", () => {
    expect(() => assertSyntheticCleanupInventory("a".repeat(64), {
      digest: "a".repeat(64),
      unsafeOwnedWorkspaceCount: 1,
    })).toThrow("shared_test_workspace_requires_review");
  });

  it("deletes Auth only while both the id and exact approved email remain unchanged", () => {
    expect(canDeleteSyntheticAuthUser(stored[0], { id: "user_1", email: "owner-1@example.com" }, [])).toBe(true);
    expect(canDeleteSyntheticAuthUser(stored[0], { id: "user_1", email: "person@gmail.com" }, [])).toBe(false);
    expect(canDeleteSyntheticAuthUser(stored[0], { id: "different", email: "owner-1@example.com" }, [])).toBe(false);
    expect(canDeleteSyntheticAuthUser(stored[0], { id: "user_1", email: "owner-1@example.com" }, ["USER_1"])).toBe(false);
  });
});
