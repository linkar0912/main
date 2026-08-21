import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { MetaApiError } from "../meta/client";
import type { AutomationParticipantRecord, AutomationRecord } from "../repository";
import { sealSecret } from "../security/secrets";
import { createInteractionPayload, readInteractionPayload } from "./postback";
import type { FlowDefinitionV2, NormalizedEvent } from "./types";
import {
  processCampaignEvent,
  processPendingCampaignInteraction,
  type CampaignRunnerClient,
  type CampaignRunnerOptions,
} from "./campaign-runner";

const NOW = Date.parse("2026-08-21T10:00:00.000Z");
const TOKEN_KEY = randomBytes(32).toString("hex");
const INTERACTION_SECRET = "campaign-interaction-secret";

const sourceSnapshot = {
  id: "media_1",
  caption: "Download our guide",
  mediaType: "VIDEO" as const,
  mediaProductType: "REELS" as const,
  permalink: "https://www.instagram.com/reel/media_1",
  timestamp: "2026-08-21T09:00:00.000Z",
};

const definition: FlowDefinitionV2 = {
  version: 2,
  trigger: {
    type: "comment",
    source: "specific_media",
    mediaIds: [sourceSnapshot.id],
    mediaSnapshots: [sourceSnapshot],
    match: "keyword",
    keywords: ["guide"],
  },
  publicReplies: ["Sent — check your messages", "It is on its way"],
  openingMessage: { text: "Would you like the guide?", optInButtonLabel: "Get the guide" },
  followGate: {
    required: true,
    notFollowingMessage: "Follow us, then check again.",
    recheckButtonLabel: "I've followed",
  },
  delivery: {
    text: "Here is your guide.",
    url: "https://example.com/protected-guide",
    buttonLabel: "Open guide",
  },
};

const automation: AutomationRecord = {
  id: "automation_campaign",
  workspaceId: "workspace_a",
  name: "Follow-gated guide",
  status: "ACTIVE",
  version: 2,
  definition,
  activatedAt: "2026-08-21T08:00:00.000Z",
  createdAt: "2026-08-21T08:00:00.000Z",
  updatedAt: "2026-08-21T09:30:00.000Z",
};

const commentEvent: NormalizedEvent = {
  id: "comment_1",
  accountId: "ig_business_1",
  type: "comment.created",
  text: "Guide please",
  commentId: "comment_1",
  mediaId: "media_1",
  recipientId: "commenter_1",
  timestamp: NOW,
};

function createClient(overrides: Partial<CampaignRunnerClient> = {}): CampaignRunnerClient {
  return {
    replyToComment: vi.fn().mockResolvedValue({ id: "public_reply_1" }),
    sendPrivateReply: vi.fn().mockResolvedValue({
      recipient_id: "scoped_user_1",
      message_id: "opening_message_1",
    }),
    sendQuickReply: vi.fn().mockResolvedValue({
      recipient_id: "scoped_user_1",
      message_id: "prompt_message_1",
    }),
    sendDirectMessage: vi.fn().mockResolvedValue({
      recipient_id: "scoped_user_1",
      message_id: "final_message_1",
    }),
    getUserFollowStatus: vi.fn().mockResolvedValue({ isUserFollowingBusiness: true }),
    getMedia: vi.fn().mockResolvedValue({
      id: sourceSnapshot.id,
      caption: sourceSnapshot.caption,
      mediaType: sourceSnapshot.mediaType,
      mediaProductType: sourceSnapshot.mediaProductType,
      permalink: sourceSnapshot.permalink,
      timestamp: sourceSnapshot.timestamp,
    }),
    ...overrides,
  };
}

async function createHarness(client = createClient()) {
  const repository = createMemoryRepository([automation]);
  await repository.upsertConnection({
    workspaceId: automation.workspaceId,
    igUserId: commentEvent.accountId,
    username: "creator",
    accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
    status: "CONNECTED",
  });
  const mapping = await repository.findWorkspaceByInstagramAccount(commentEvent.accountId);
  if (!mapping) throw new Error("test connection mapping was not created");
  const options: CampaignRunnerOptions = {
    client,
    tokenEncryptionKey: TOKEN_KEY,
    interactionSecret: INTERACTION_SECRET,
  };
  return { client, repository, mapping, options };
}

async function openParticipant(
  client = createClient({ replyToComment: vi.fn().mockResolvedValue({ id: "public_reply_1" }) }),
) {
  const harness = await createHarness(client);
  await processCampaignEvent(
    commentEvent,
    automation,
    harness.mapping,
    harness.repository,
    harness.options,
  );
  const [participant] = await harness.repository.listParticipants(
    automation.workspaceId,
    automation.id,
    10,
  );
  if (!participant) throw new Error("test participant was not created");
  const openingCall = vi.mocked(client.sendPrivateReply).mock.calls[0];
  const opening = openingCall?.[2];
  if (typeof opening === "string" || !opening?.quickReply) {
    throw new Error("opening quick reply was not sent");
  }
  return { ...harness, participant, optInPayload: opening.quickReply.payload };
}

function interactionEvent(
  payload: string,
  timestamp: number,
  overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return {
    id: `interaction_${timestamp}`,
    accountId: commentEvent.accountId,
    type: "quick_reply.received",
    text: "button response",
    recipientId: "scoped_user_1",
    interactionPayload: payload,
    timestamp,
    ...overrides,
  };
}

async function readParticipant(
  repository: Awaited<ReturnType<typeof createHarness>>["repository"],
): Promise<AutomationParticipantRecord> {
  const [participant] = await repository.listParticipants(automation.workspaceId, automation.id, 1);
  if (!participant) throw new Error("participant was not found");
  return participant;
}

describe("follow-gated campaign runner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates one participant and records independent public and opening delivery results", async () => {
    const { client, repository, mapping, options } = await createHarness();

    const result = await processCampaignEvent(commentEvent, automation, mapping, repository, options);
    const participant = await readParticipant(repository);

    expect(result).toMatchObject({ handled: true, participantId: participant.id, matched: 1, sent: 1 });
    expect(participant).toMatchObject({
      automationId: automation.id,
      sourceCommentId: commentEvent.commentId,
      sourceMediaSnapshot: sourceSnapshot,
      matchedKeyword: "guide",
      state: "OPENING_SENT",
      publicReplyStatus: "SENT",
      publicReplyProviderId: "public_reply_1",
      openingStatus: "SENT",
      openingProviderId: "opening_message_1",
      igScopedUserId: "scoped_user_1",
    });
    expect(client.replyToComment).toHaveBeenCalledTimes(1);
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);

    const publicText = vi.mocked(client.replyToComment).mock.calls[0]?.[2];
    const opening = vi.mocked(client.sendPrivateReply).mock.calls[0]?.[2];
    expect(definition.publicReplies).toContain(publicText);
    expect(opening).toMatchObject({
      text: definition.openingMessage.text,
      quickReply: { title: definition.openingMessage.optInButtonLabel },
    });
    if (typeof opening === "string" || !opening.quickReply) throw new Error("missing opening payload");
    expect(readInteractionPayload(opening.quickReply.payload, INTERACTION_SECRET, NOW)).toEqual({
      participantId: participant.id,
      action: "opt_in",
    });
  });

  it("replays only a retryable pending opener after the public reply succeeded", async () => {
    const client = createClient({
      sendPrivateReply: vi.fn()
        .mockRejectedValueOnce(new MetaApiError("temporarily unavailable", 503))
        .mockResolvedValueOnce({ recipient_id: "scoped_user_1", message_id: "opening_message_2" }),
    });
    const { repository, mapping, options } = await createHarness(client);

    await expect(
      processCampaignEvent(commentEvent, automation, mapping, repository, options),
    ).rejects.toThrow("temporarily unavailable");
    expect(await readParticipant(repository)).toMatchObject({
      state: "COMMENT_MATCHED",
      publicReplyStatus: "SENT",
      openingStatus: "PENDING",
    });

    await expect(
      processCampaignEvent(commentEvent, automation, mapping, repository, options),
    ).resolves.toMatchObject({ handled: true, sent: 1 });
    expect(client.replyToComment).toHaveBeenCalledTimes(1);
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(2);
    expect(await readParticipant(repository)).toMatchObject({
      state: "OPENING_SENT",
      publicReplyProviderId: "public_reply_1",
      openingProviderId: "opening_message_2",
    });
  });

  it("does not repeat a successful public reply or opening reply on comment replay", async () => {
    const { client, repository, mapping, options } = await createHarness();

    await Promise.all([
      processCampaignEvent(commentEvent, automation, mapping, repository, options),
      processCampaignEvent(commentEvent, automation, mapping, repository, options),
    ]);
    await processCampaignEvent(commentEvent, automation, mapping, repository, options);

    expect(await repository.listParticipants(automation.workspaceId, automation.id, 10)).toHaveLength(1);
    expect(client.replyToComment).toHaveBeenCalledTimes(1);
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it("delivers the protected link only after opt-in and a fresh exact true follow response", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: true });
    const event = interactionEvent(harness.optInPayload, NOW + 1_000);

    const result = await processPendingCampaignInteraction(
      event,
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(result).toMatchObject({ handled: true, result: { participantId: harness.participant.id, sent: 1 } });
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledWith(
      { igUserId: commentEvent.accountId, accessToken: "access-token" },
      "scoped_user_1",
    );
    expect(harness.client.sendDirectMessage).toHaveBeenCalledWith(
      { igUserId: commentEvent.accountId, accessToken: "access-token" },
      "scoped_user_1",
      {
        type: "button",
        text: definition.delivery.text,
        buttonLabel: definition.delivery.buttonLabel,
        url: definition.delivery.url,
      },
    );
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "LINK_SENT",
      followStatus: true,
      followCheckedAt: new Date(event.timestamp).toISOString(),
      finalDeliveryStatus: "SENT",
      finalProviderId: "final_message_1",
    });
  });

  it("prompts an opted-in non-follower with a signed user-initiated recheck", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const event = interactionEvent(harness.optInPayload, NOW + 1_000);

    await processPendingCampaignInteraction(event, harness.mapping, harness.repository, harness.options);

    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
    expect(harness.client.sendQuickReply).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(harness.client.sendQuickReply).mock.calls[0];
    expect(prompt?.slice(1, 3)).toEqual(["scoped_user_1", definition.followGate.notFollowingMessage]);
    expect(prompt?.[3]?.title).toBe(definition.followGate.recheckButtonLabel);
    expect(readInteractionPayload(prompt?.[3]?.payload ?? "", INTERACTION_SECRET, event.timestamp)).toEqual({
      participantId: harness.participant.id,
      action: "recheck",
    });
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "FOLLOW_REQUIRED",
      followStatus: false,
      recheckCount: 0,
      messagingWindowExpiresAt: new Date(event.timestamp + 24 * 60 * 60 * 1_000).toISOString(),
    });
  });

  it("delivers once when a user-initiated recheck gets a fresh true response", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValueOnce({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    vi.setSystemTime(optInEvent.timestamp);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = vi.mocked(harness.client.sendQuickReply).mock.calls[0]?.[3]?.payload;
    if (!recheckPayload) throw new Error("recheck payload was not sent");
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValueOnce({ isUserFollowingBusiness: true });
    const recheckEvent = interactionEvent(recheckPayload, optInEvent.timestamp + 10_000);

    await processPendingCampaignInteraction(recheckEvent, harness.mapping, harness.repository, harness.options);
    await processPendingCampaignInteraction(recheckEvent, harness.mapping, harness.repository, harness.options);

    expect(await readParticipant(harness.repository)).toMatchObject({ state: "LINK_SENT", followStatus: true });
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(2);
  });

  it("increments the recheck count only after an allowed false recheck", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    vi.setSystemTime(optInEvent.timestamp);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = vi.mocked(harness.client.sendQuickReply).mock.calls[0]?.[3]?.payload;
    if (!recheckPayload) throw new Error("recheck payload was not sent");
    const recheckEvent = interactionEvent(recheckPayload, optInEvent.timestamp + 10_000);

    await processPendingCampaignInteraction(recheckEvent, harness.mapping, harness.repository, harness.options);

    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "FOLLOW_REQUIRED",
      followStatus: false,
      recheckCount: 1,
      followCheckedAt: new Date(recheckEvent.timestamp).toISOString(),
    });
    expect(harness.client.sendQuickReply).toHaveBeenCalledTimes(2);
    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
  });

  it("rejects a recheck before 10 seconds and accepts the exact cooldown boundary", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    vi.setSystemTime(optInEvent.timestamp);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = vi.mocked(harness.client.sendQuickReply).mock.calls[0]?.[3]?.payload;
    if (!recheckPayload) throw new Error("recheck payload was not sent");

    await processPendingCampaignInteraction(
      interactionEvent(recheckPayload, optInEvent.timestamp + 9_999),
      harness.mapping,
      harness.repository,
      harness.options,
    );
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(1);
    expect((await readParticipant(harness.repository)).recheckCount).toBe(0);

    await processPendingCampaignInteraction(
      interactionEvent(recheckPayload, optInEvent.timestamp + 10_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(2);
    expect((await readParticipant(harness.repository)).recheckCount).toBe(1);
  });

  it("allows only one competing recheck to claim the next cooldown slot", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    vi.setSystemTime(optInEvent.timestamp);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = vi.mocked(harness.client.sendQuickReply).mock.calls[0]?.[3]?.payload;
    if (!recheckPayload) throw new Error("recheck payload was not sent");
    const timestamp = optInEvent.timestamp + 10_000;

    await Promise.all([
      processPendingCampaignInteraction(
        interactionEvent(recheckPayload, timestamp, { id: "recheck_competing_a" }),
        harness.mapping,
        harness.repository,
        harness.options,
      ),
      processPendingCampaignInteraction(
        interactionEvent(recheckPayload, timestamp, { id: "recheck_competing_b" }),
        harness.mapping,
        harness.repository,
        harness.options,
      ),
    ]);

    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(2);
    expect(harness.client.sendQuickReply).toHaveBeenCalledTimes(2);
    expect((await readParticipant(harness.repository)).recheckCount).toBe(1);
  });

  it("caps user-initiated follow checks at ten", async () => {
    const { client, repository, mapping, options } = await createHarness();
    const created = await repository.createParticipant({
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      instagramAccountId: commentEvent.accountId,
      igScopedUserId: "scoped_user_1",
      sourceCommentId: commentEvent.id,
      sourceMediaId: sourceSnapshot.id,
      sourceMediaSnapshot: sourceSnapshot,
    });
    await repository.transitionParticipant(created.record.id, ["COMMENT_MATCHED"], {
      state: "FOLLOW_REQUIRED",
      openingStatus: "SENT",
      followStatus: false,
      followCheckedAt: new Date(NOW - 10_000).toISOString(),
      messagingWindowExpiresAt: new Date(NOW + 60_000).toISOString(),
      recheckCount: 10,
    });
    const payload = createInteractionPayload(
      { participantId: created.record.id, action: "recheck" },
      INTERACTION_SECRET,
      NOW - 1_000,
    );

    const result = await processPendingCampaignInteraction(
      interactionEvent(payload, NOW),
      mapping,
      repository,
      options,
    );

    expect(result).toMatchObject({ handled: true });
    expect(client.getUserFollowStatus).not.toHaveBeenCalled();
    expect((await readParticipant(repository)).recheckCount).toBe(10);
  });

  it("expires a valid recheck when the 24-hour messaging window is exactly closed", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValueOnce({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const expiresAt = optInEvent.timestamp + 24 * 60 * 60 * 1_000;
    const issuedRecheckPayload = vi.mocked(harness.client.sendQuickReply).mock.calls[0]?.[3]?.payload;
    if (!issuedRecheckPayload) throw new Error("recheck payload was not sent");

    await processPendingCampaignInteraction(
      interactionEvent(issuedRecheckPayload, expiresAt),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(await readParticipant(harness.repository)).toMatchObject({ state: "EXPIRED" });
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(1);
    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
  });

  it("ignores invalid, tampered, and participant-mismatched payloads", async () => {
    const harness = await openParticipant();
    const otherPayload = createInteractionPayload(
      { participantId: "participant_other", action: "opt_in" },
      INTERACTION_SECRET,
      NOW,
    );

    for (const payload of ["invalid", `${harness.optInPayload}tampered`, otherPayload]) {
      await expect(
        processPendingCampaignInteraction(
          interactionEvent(payload, NOW + 1_000),
          harness.mapping,
          harness.repository,
          harness.options,
        ),
      ).resolves.toEqual({ handled: false });
    }

    expect(await readParticipant(harness.repository)).toMatchObject({ state: "OPENING_SENT" });
    expect(harness.client.getUserFollowStatus).not.toHaveBeenCalled();
    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["profile API error", new MetaApiError("permission denied", 403)],
    ["missing follower status", undefined],
  ])("fails closed on %s and never sends the protected link", async (_label, failure) => {
    const harness = await openParticipant();
    if (failure) {
      vi.mocked(harness.client.getUserFollowStatus).mockRejectedValue(failure);
    } else {
      vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue(
        {} as { isUserFollowingBusiness: boolean },
      );
    }

    const result = await processPendingCampaignInteraction(
      interactionEvent(harness.optInPayload, NOW + 1_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(result).toMatchObject({ handled: true, result: { failed: 1 } });
    const participant = await readParticipant(harness.repository);
    expect(participant.state).toBe("FAILED");
    expect(participant.followStatus).toBeUndefined();
    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
  });

  it("deduplicates a repeated successful interaction webhook", async () => {
    const harness = await openParticipant();
    const event = interactionEvent(harness.optInPayload, NOW + 1_000);

    await processPendingCampaignInteraction(event, harness.mapping, harness.repository, harness.options);
    await processPendingCampaignInteraction(event, harness.mapping, harness.repository, harness.options);

    expect(await readParticipant(harness.repository)).toMatchObject({ state: "LINK_SENT" });
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(1);
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
  });
});
