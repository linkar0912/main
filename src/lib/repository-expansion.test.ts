import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";
import {
  notificationRecentlySent,
  notifyWorkspaceManagers,
  resetNotificationDedupeForTests,
} from "./notifications";
import type { CreateParticipantInput } from "./repository";
import type { MediaSnapshot } from "./automation/types";

const snapshot: MediaSnapshot = {
  id: "media_1",
  mediaType: "VIDEO",
  mediaProductType: "REELS",
  permalink: "https://www.instagram.com/reel/media_1",
  timestamp: "2026-08-21T09:00:00.000Z",
};

const participantInput: CreateParticipantInput = {
  workspaceId: "workspace_clicks",
  automationId: "automation_clicks",
  instagramAccountId: "ig_1",
  sourceCommentId: "comment_1",
  sourceMediaId: "media_1",
  sourceMediaSnapshot: snapshot,
};

describe("click tracking repository methods", () => {
  it("records the first delivery click exactly once", async () => {
    const repository = createMemoryRepository();
    const { record } = await repository.createParticipant(participantInput);

    expect(await repository.getParticipantById(record.id)).not.toBeNull();
    expect(await repository.getParticipantById("missing")).toBeNull();

    const at = "2026-08-21T10:30:00.000Z";
    expect(await repository.markDeliveryClicked(record.id, at)).toBe(true);
    expect(await repository.markDeliveryClicked(record.id, at)).toBe(false);
    expect((await repository.getParticipantById(record.id))?.deliveryClickedAt).toBe(at);
  });

  it("lists recent participants per workspace", async () => {
    const repository = createMemoryRepository();
    await repository.createParticipant(participantInput);
    await repository.createParticipant({ ...participantInput, sourceCommentId: "comment_2" });

    expect(await repository.listRecentParticipants("workspace_clicks", 10)).toHaveLength(2);
    expect(await repository.listRecentParticipants("other_workspace", 10)).toHaveLength(0);
  });

  it("buckets participants into UTC day counts", async () => {
    const repository = createMemoryRepository();
    await repository.createParticipant(participantInput);
    const series = await repository.countParticipantsPerDay("workspace_clicks", 3);
    expect(series).toHaveLength(3);
    expect(series.reduce((total, entry) => total + entry.count, 0)).toBe(1);
  });
});

describe("workspace manager notifications", () => {
  it("dedupes repeated alerts for the same key", async () => {
    resetNotificationDedupeForTests();
    const key = `test:${Math.random()}`;

    expect(notificationRecentlySent(key)).toBe(false);
    await notifyWorkspaceManagers("ws_x", key, "Subject", "Body");
    expect(notificationRecentlySent(key)).toBe(true);

    // A second alert inside the window is suppressed without touching the mailer.
    expect(await notifyWorkspaceManagers("ws_x", key, "Subject", "Body")).toBe(false);
    resetNotificationDedupeForTests();
    expect(notificationRecentlySent(key)).toBe(false);
  });
});
