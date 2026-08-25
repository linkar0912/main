import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";
import type { CreateParticipantInput } from "./repository";
import type { MediaSnapshot } from "./automation/types";

const snapshot: MediaSnapshot = {
  id: "media_1",
  mediaType: "VIDEO",
  mediaProductType: "REELS",
  permalink: "https://www.instagram.com/reel/media_1",
  timestamp: "2026-08-25T09:00:00.000Z",
};

const baseParticipant: CreateParticipantInput = {
  workspaceId: "workspace_handoff",
  automationId: "automation_1",
  instagramAccountId: "ig_1",
  sourceCommentId: "comment_1",
  sourceMediaId: "media_1",
  sourceMediaSnapshot: snapshot,
  igScopedUserId: "sender_1",
};

describe("human handoff repository methods", () => {
  it("pauses a participant and clears the flag on resume", async () => {
    const repository = createMemoryRepository();
    const { record } = await repository.createParticipant(baseParticipant);
    const at = "2026-08-25T10:00:00.000Z";
    const paused = await repository.pauseParticipant(record.id, "needs human review", "user_42", at);
    expect(paused).not.toBeNull();
    expect(paused!.pausedAt).toBe(at);
    expect(paused!.pausedReason).toBe("needs human review");
    expect(paused!.pausedByUserId).toBe("user_42");

    const resumed = await repository.resumeParticipant(record.id, at);
    expect(resumed!.pausedAt).toBeUndefined();
    expect(resumed!.pausedReason).toBeUndefined();
    expect(resumed!.pausedByUserId).toBeUndefined();
  });

  it("pauseParticipantsBySender only touches the targeted sender and skips already-paused", async () => {
    const repository = createMemoryRepository();
    const first = await repository.createParticipant(baseParticipant);
    await repository.createParticipant({ ...baseParticipant, sourceCommentId: "comment_2" });
    const other = await repository.createParticipant({
      ...baseParticipant,
      instagramAccountId: "ig_other",
      sourceCommentId: "comment_3",
      igScopedUserId: "other_sender",
    });
    const at = "2026-08-25T10:00:00.000Z";
    const pausedCount = await repository.pauseParticipantsBySender(
      "workspace_handoff",
      "ig_1",
      "sender_1",
      "manual review",
      "user_42",
      at,
    );
    expect(pausedCount).toBe(2);
    // Already-paused are not double-counted.
    const again = await repository.pauseParticipantsBySender(
      "workspace_handoff",
      "ig_1",
      "sender_1",
      "manual review",
      "user_42",
      at,
    );
    expect(again).toBe(0);
    // The other sender is untouched.
    const otherRecord = await repository.getParticipantById(other.record.id);
    expect(otherRecord!.pausedAt).toBeUndefined();
    expect(first.record.id).toBeDefined();
  });

  it("listPausedParticipantsByWorkspace returns the workspace's paused participants newest first", async () => {
    const repository = createMemoryRepository();
    const first = await repository.createParticipant(baseParticipant);
    const second = await repository.createParticipant({ ...baseParticipant, sourceCommentId: "comment_2" });
    await repository.pauseParticipant(first.record.id, "first", "user_1", "2026-08-25T10:00:00.000Z");
    await repository.pauseParticipant(second.record.id, "second", "user_2", "2026-08-25T11:00:00.000Z");
    const list = await repository.listPausedParticipantsByWorkspace("workspace_handoff", 10);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(second.record.id);
    expect(list[1].id).toBe(first.record.id);
  });

  it("returns null for unknown participant ids", async () => {
    const repository = createMemoryRepository();
    expect(await repository.pauseParticipant("missing", "x", "u", "2026-08-25T10:00:00.000Z")).toBeNull();
    expect(await repository.resumeParticipant("missing", "2026-08-25T10:00:00.000Z")).toBeNull();
  });
});
