import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { PARTICIPANT_RETENTION_MS, sweepStaleParticipants } from "./participant-retention";

describe("sweepStaleParticipants", () => {
  it("expires participants past their messaging window and deletes terminal rows past the retention window", async () => {
    const repository = createMemoryRepository();
    const expireSpy = vi.spyOn(repository, "expireStaleParticipants");
    const deleteSpy = vi.spyOn(repository, "deleteStaleTerminalParticipants");
    const now = new Date("2026-08-21T12:00:00.000Z");

    const result = await sweepStaleParticipants(repository, now);

    expect(result).toEqual({ expired: 0, deleted: 0 });
    expect(expireSpy).toHaveBeenCalledWith(now.toISOString(), "Messaging window expired");
    expect(deleteSpy).toHaveBeenCalledWith(new Date(now.getTime() - PARTICIPANT_RETENTION_MS).toISOString());
  });

  it("actually expires and deletes real participant rows end to end", async () => {
    vi.useFakeTimers();
    try {
      const snapshot = {
        id: "media_1",
        mediaType: "VIDEO" as const,
        mediaProductType: "REELS" as const,
        permalink: "https://instagram.com/reel/media_1",
        timestamp: "2026-08-21T09:00:00.000Z",
      };
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const repository = createMemoryRepository();

      const { record: veryOldTerminal } = await repository.createParticipant({
        workspaceId: "workspace_a",
        automationId: "automation_1",
        instagramAccountId: "ig_123",
        sourceCommentId: "comment_2",
        sourceMediaId: "media_1",
        sourceMediaSnapshot: snapshot,
        state: "LINK_SENT",
      });

      vi.setSystemTime(new Date("2026-08-21T00:00:00.000Z"));
      const { record: staleWindow } = await repository.createParticipant({
        workspaceId: "workspace_a",
        automationId: "automation_1",
        instagramAccountId: "ig_123",
        sourceCommentId: "comment_1",
        sourceMediaId: "media_1",
        sourceMediaSnapshot: snapshot,
        state: "FOLLOW_REQUIRED",
        messagingWindowExpiresAt: "2026-08-01T00:00:00.000Z",
      });

      const now = new Date("2026-08-21T12:00:00.000Z");
      const result = await sweepStaleParticipants(repository, now);

      expect(result.expired).toBe(1);
      expect(result.deleted).toBe(1);
      expect((await repository.getParticipant("workspace_a", "ig_123", staleWindow.id))?.state).toBe("EXPIRED");
      expect(await repository.getParticipant("workspace_a", "ig_123", veryOldTerminal.id)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
