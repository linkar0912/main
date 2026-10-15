import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FlowDefinitionV2, MediaSnapshot, NormalizedEvent } from "./types";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { processNormalizedEvent, type AutomationRunnerClient } from "./runner";

// A retried comment job whose participant already exists goes through the
// classic runner's existing-participant path. The 7-day private reply check
// must use the comment's own time there too, not only the participant's
// creation time, which can be days later than the comment.

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = Date.parse("2026-10-16T09:00:00.000Z");

const mediaSnapshot: MediaSnapshot = {
  id: "media_1",
  mediaType: "VIDEO",
  mediaProductType: "REELS",
  permalink: "https://www.instagram.com/reel/media_1",
  timestamp: "2026-10-01T09:00:00.000Z",
};

const definition: FlowDefinitionV2 = {
  version: 2,
  trigger: {
    type: "comment",
    source: "specific_media",
    mediaIds: ["media_1"],
    mediaSnapshots: [mediaSnapshot],
    match: "keyword",
    keywords: ["guide"],
  },
  publicReplies: [],
  openingMessage: { text: "Want the guide?", optInButtonLabel: "Get guide" },
  followGate: { required: false, notFollowingMessage: "Follow first", recheckButtonLabel: "I've followed" },
  delivery: { text: "Here is the guide", url: "https://example.com/protected" },
};

function createClient(): AutomationRunnerClient {
  return {
    sendPrivateReply: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "opening_1" }),
    sendDirectMessage: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "direct_1" }),
    replyToComment: vi.fn().mockResolvedValue({ id: "public_1" }),
    sendQuickReply: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "prompt_1" }),
    getUserFollowStatus: vi.fn().mockResolvedValue({ isUserFollowingBusiness: true }),
    getMedia: vi.fn().mockResolvedValue(mediaSnapshot),
  };
}

async function retryWithExistingParticipant(commentAt: number) {
  const key = randomBytes(32).toString("hex");
  const campaign = {
    id: "campaign_retry",
    workspaceId: "workspace_a",
    name: "Retry campaign",
    status: "ACTIVE" as const,
    version: 2,
    priority: 0,
    definition,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
  };
  const repository = createMemoryRepository([campaign]);
  await repository.upsertConnection({
    workspaceId: "workspace_a",
    igUserId: "ig_1",
    username: "creator",
    accessTokenEncrypted: sealSecret("access-token", key),
    status: "CONNECTED",
  });
  // The first attempt created the participant just now, before the opening
  // reply went out.
  await repository.createParticipant({
    workspaceId: "workspace_a",
    automationId: campaign.id,
    instagramAccountId: "ig_1",
    sourceCommentId: "comment_1",
    sourceMediaId: "media_1",
    sourceMediaSnapshot: mediaSnapshot,
  });
  const event: NormalizedEvent = {
    id: "comment_1",
    accountId: "ig_1",
    type: "comment.created",
    text: "guide",
    commentId: "comment_1",
    mediaId: "media_1",
    recipientId: "person_1",
    timestamp: commentAt,
  };
  const client = createClient();
  const result = await processNormalizedEvent(event, repository, {
    client,
    tokenEncryptionKey: key,
    interactionSecret: "app-secret",
    campaignsEnabled: true,
  });
  const [participant] = await repository.listParticipants("workspace_a", campaign.id, 1);
  return { client, result, participant };
}

describe("campaign retry of an existing participant", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips the opening private reply when the comment itself is older than 7 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);

    const { client, participant } = await retryWithExistingParticipant(NOW - 7 * DAY_MS - 60_000);

    expect(client.sendPrivateReply).not.toHaveBeenCalled();
    expect(participant).toMatchObject({
      state: "EXPIRED",
      openingStatus: "SKIPPED",
      openingError: "Instagram only allows a private reply within 7 days of the comment",
    });
  });

  it("still sends the opening private reply when the comment is inside 7 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);

    const { client, participant } = await retryWithExistingParticipant(NOW - 7 * DAY_MS + 60_000);

    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(participant).toMatchObject({ openingStatus: "SENT" });
  });
});
