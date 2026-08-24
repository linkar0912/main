import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";
import { broadcastSegmentCutoff } from "./repository";

async function seedContact(
  repository: ReturnType<typeof createMemoryRepository>,
  igScopedUserId: string,
  lastSeenAt: string,
) {
  await repository.ensureWorkspace("workspace_a", "owner@example.com");
  await repository.upsertConnection({
    workspaceId: "workspace_a",
    igUserId: "ig_1",
    username: "creator",
    accessTokenEncrypted: "sealed",
    status: "CONNECTED",
  });
  await repository.touchContact("workspace_a", "ig_1", igScopedUserId, new Date().toISOString());
  // Move lastSeenAt back with a second touch (updates take the given timestamp).
  await repository.touchContact("workspace_a", "ig_1", igScopedUserId, lastSeenAt);
}

describe("win-back broadcast segments", () => {
  it("computes cutoffs only for inactive segments", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    expect(broadcastSegmentCutoff("all_contacts", now)).toBeNull();
    expect(broadcastSegmentCutoff("captured_email", now)).toBeNull();
    expect(broadcastSegmentCutoff("inactive_7d", now)?.toISOString()).toBe("2026-08-17T12:00:00.000Z");
    expect(broadcastSegmentCutoff("inactive_30d", now)?.toISOString()).toBe("2026-07-25T12:00:00.000Z");
  });

  it("lists only contacts quiet past the cutoff, never suppressed ones", async () => {
    const repository = createMemoryRepository();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1_000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1_000).toISOString();

    await seedContact(repository, "quiet_1", tenDaysAgo);
    await seedContact(repository, "fresh_1", oneHourAgo);

    await repository.ensureWorkspace("workspace_b", "other@example.com");
    await repository.upsertConnection({
      workspaceId: "workspace_b",
      igUserId: "ig_2",
      username: "other",
      accessTokenEncrypted: "sealed",
      status: "CONNECTED",
    });
    await repository.touchContact("workspace_b", "ig_2", "foreign_quiet", tenDaysAgo);

    const winback = await repository.listBroadcastRecipients("workspace_a", "inactive_7d", 100);
    expect(winback.map((recipient) => recipient.igScopedUserId)).toEqual(["quiet_1"]);

    const all = await repository.listBroadcastRecipients("workspace_a", "all_contacts", 100);
    expect(all.map((recipient) => recipient.igScopedUserId).sort()).toEqual(["fresh_1", "quiet_1"]);
  });
});
