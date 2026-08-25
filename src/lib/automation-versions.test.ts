import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";
import type { FlowDefinition } from "./automation/types";

const baseDefinition: FlowDefinition = {
  version: 1,
  trigger: { type: "message", match: "keyword", keywords: ["hi"] },
  conditions: [],
  actions: [{ type: "send_text", text: "Hello" }],
};

const nextDefinition: FlowDefinition = {
  ...baseDefinition,
  actions: [{ type: "send_text", text: "Hello v2" }],
};

async function seed(repository: ReturnType<typeof createMemoryRepository>) {
  await repository.ensureWorkspace("workspace_versions", "owner@team.com");
  const created = await repository.createAutomation("workspace_versions", {
    name: "Test flow",
    definition: baseDefinition,
  });
  return created;
}

describe("automation version history", () => {
  it("snapshots the current state on demand and increments the version number", async () => {
    const repository = createMemoryRepository();
    const automation = await seed(repository);
    const first = await repository.snapshotAutomation("workspace_versions", automation.id);
    expect(first).not.toBeNull();
    expect(first!.version).toBe(1);
    expect(first!.name).toBe("Test flow");
    expect(first!.definition).toEqual(baseDefinition);

    const second = await repository.snapshotAutomation("workspace_versions", automation.id, "user_42");
    expect(second!.version).toBe(2);
    expect(second!.snapshotBy).toBe("user_42");
  });

  it("lists snapshots newest first and respects the limit", async () => {
    const repository = createMemoryRepository();
    const automation = await seed(repository);
    for (let i = 0; i < 5; i += 1) {
      await repository.snapshotAutomation("workspace_versions", automation.id);
    }
    const versions = await repository.listAutomationVersions("workspace_versions", automation.id, 3);
    expect(versions).toHaveLength(3);
    expect(versions[0].version).toBeGreaterThan(versions[1].version);
  });

  it("restores a snapshot and keeps the history append-only", async () => {
    const repository = createMemoryRepository();
    const automation = await seed(repository);
    const baselineSnapshot = await repository.snapshotAutomation("workspace_versions", automation.id);
    await repository.updateAutomation("workspace_versions", automation.id, { definition: nextDefinition });
    const midSnapshot = await repository.snapshotAutomation("workspace_versions", automation.id);
    const restored = await repository.restoreAutomationVersion(
      "workspace_versions",
      automation.id,
      baselineSnapshot!.id,
      "user_42",
    );
    expect(restored).not.toBeNull();
    expect(restored!.definition).toEqual(baseDefinition);
    const all = await repository.listAutomationVersions("workspace_versions", automation.id, 10);
    // baseline + post-update + pre-restore (captured by restoreAutomationVersion itself) = 3.
    expect(all).toHaveLength(3);
    // The most-recent snapshot was captured *during* the restore call (pre-state).
    const latest = all[0];
    expect(latest.snapshotBy).toBe("user_42");
    expect(latest.definition).toEqual(nextDefinition);
    // The original snapshot is still in the list, untouched.
    const original = all.find((snapshot) => snapshot.id === baselineSnapshot!.id);
    expect(original).toBeDefined();
    expect(original!.version).toBeLessThan(latest.version);
    expect(midSnapshot).not.toBeNull();
  });

  it("returns null when the version does not exist", async () => {
    const repository = createMemoryRepository();
    const automation = await seed(repository);
    const result = await repository.restoreAutomationVersion(
      "workspace_versions",
      automation.id,
      "missing_version_id",
    );
    expect(result).toBeNull();
  });

  it("isolates versions across workspaces", async () => {
    const repository = createMemoryRepository();
    const automation = await seed(repository);
    await repository.snapshotAutomation("workspace_versions", automation.id);
    const list = await repository.listAutomationVersions("other_workspace", automation.id, 10);
    expect(list).toHaveLength(0);
    const missing = await repository.getAutomationVersion("other_workspace", automation.id, "anything");
    expect(missing).toBeNull();
  });

  it("deletes version history when the automation is deleted", async () => {
    const repository = createMemoryRepository();
    const automation = await seed(repository);
    await repository.snapshotAutomation("workspace_versions", automation.id);
    await repository.deleteAutomation("workspace_versions", automation.id);
    const list = await repository.listAutomationVersions("workspace_versions", automation.id, 10);
    expect(list).toHaveLength(0);
  });
});
