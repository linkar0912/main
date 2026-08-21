import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { MetaApiError } from "../meta/client";
import type {
  AutomationParticipantRecord,
  AutomationRecord,
  AutomationRepository,
} from "../repository";
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
        // The delivered link points at the click-tracking redirect for this
        // participant; the redirect forwards to the real delivery URL.
        url: expect.stringMatching(new RegExp(`/api/t/${harness.participant.id}$`)),
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

  it("resumes a retryable pending final delivery before recheck cooldown or another profile lookup", async () => {
    const client = createClient({
      getUserFollowStatus: vi.fn()
        .mockResolvedValueOnce({ isUserFollowingBusiness: false })
        .mockResolvedValueOnce({ isUserFollowingBusiness: true }),
      sendDirectMessage: vi.fn()
        .mockRejectedValueOnce(new MetaApiError("temporarily unavailable", 503))
        .mockResolvedValueOnce({ recipient_id: "scoped_user_1", message_id: "final_message_retry" }),
    });
    const harness = await openParticipant(client);
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = vi.mocked(client.sendQuickReply).mock.calls[0]?.[3]?.payload;
    if (!recheckPayload) throw new Error("recheck payload was not sent");
    const recheckEvent = interactionEvent(recheckPayload, optInEvent.timestamp + 10_000);

    await expect(
      processPendingCampaignInteraction(recheckEvent, harness.mapping, harness.repository, harness.options),
    ).rejects.toThrow("temporarily unavailable");
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "FOLLOW_VERIFIED",
      finalDeliveryStatus: "PENDING",
    });

    await processPendingCampaignInteraction(recheckEvent, harness.mapping, harness.repository, harness.options);
    await processPendingCampaignInteraction(recheckEvent, harness.mapping, harness.repository, harness.options);

    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "LINK_SENT",
      finalDeliveryStatus: "SENT",
      finalProviderId: "final_message_retry",
    });
    expect(client.getUserFollowStatus).toHaveBeenCalledTimes(2);
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(2);
  });

  it("reconciles final provider success after participant persistence fails without sending twice", async () => {
    const harness = await openParticipant();
    const originalTransition = harness.repository.transitionParticipant;
    let failLinkTransition = true;
    const repository: AutomationRepository = {
      ...harness.repository,
      transitionParticipant: vi.fn(async (id, expectedStates, patch) => {
        if (patch.state === "LINK_SENT" && failLinkTransition) {
          failLinkTransition = false;
          throw new Error("participant persistence failed");
        }
        return originalTransition(id, expectedStates, patch);
      }),
    };
    const event = interactionEvent(harness.optInPayload, NOW + 1_000);

    await expect(
      processPendingCampaignInteraction(event, harness.mapping, repository, harness.options),
    ).rejects.toThrow("participant persistence failed");
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);

    await processPendingCampaignInteraction(event, harness.mapping, repository, harness.options);

    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "LINK_SENT",
      finalDeliveryStatus: "SENT",
      finalProviderId: "final_message_1",
    });
  });

  it("reconciles opening provider success after participant persistence fails without sending twice", async () => {
    const client = createClient();
    const harness = await createHarness(client);
    const originalTransition = harness.repository.transitionParticipant;
    let failOpeningTransition = true;
    const repository: AutomationRepository = {
      ...harness.repository,
      transitionParticipant: vi.fn(async (id, expectedStates, patch) => {
        if (patch.state === "OPENING_SENT" && failOpeningTransition) {
          failOpeningTransition = false;
          throw new Error("opening persistence failed");
        }
        return originalTransition(id, expectedStates, patch);
      }),
    };

    await expect(
      processCampaignEvent(commentEvent, automation, harness.mapping, repository, harness.options),
    ).rejects.toThrow("opening persistence failed");
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);

    await processCampaignEvent(commentEvent, automation, harness.mapping, repository, harness.options);

    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "OPENING_SENT",
      openingStatus: "SENT",
      openingProviderId: "opening_message_1",
      igScopedUserId: "scoped_user_1",
    });
  });

  it("fails closed when a recorded opening success lacks reconciliation identifiers", async () => {
    const harness = await createHarness();
    const created = await harness.repository.createParticipant({
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      instagramAccountId: commentEvent.accountId,
      sourceCommentId: commentEvent.id,
      sourceMediaId: sourceSnapshot.id,
      sourceMediaSnapshot: sourceSnapshot,
      publicReplyStatus: "SENT",
      publicReplyProviderId: "public_existing",
    });
    await harness.repository.recordExecution({
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      externalEventId: commentEvent.id,
      dedupeKey: `campaign:${created.record.id}:opening_reply`,
      status: "SENT",
      providerMessageId: "opening_without_recipient",
    });

    await processCampaignEvent(commentEvent, automation, harness.mapping, harness.repository, harness.options);

    expect(harness.client.sendPrivateReply).not.toHaveBeenCalled();
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "FAILED",
      openingStatus: "FAILED",
      openingError: expect.stringContaining("missing provider identifiers"),
    });
  });

  it("fails closed when a recorded final success lacks its reconciliation identifier", async () => {
    const harness = await openParticipant();
    await harness.repository.transitionParticipant(harness.participant.id, ["OPENING_SENT"], {
      state: "FOLLOW_VERIFIED",
      followStatus: true,
      followCheckedAt: new Date(NOW + 1_000).toISOString(),
      messagingWindowExpiresAt: new Date(NOW + 60_000).toISOString(),
      finalDeliveryStatus: "PENDING",
    });
    await harness.repository.recordExecution({
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      externalEventId: "final_missing_id",
      dedupeKey: `campaign:${harness.participant.id}:final_delivery`,
      status: "SENT",
    });
    const payload = createInteractionPayload(
      { participantId: harness.participant.id, action: "recheck" },
      INTERACTION_SECRET,
      NOW,
    );

    await processPendingCampaignInteraction(
      interactionEvent(payload, NOW + 1_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "FAILED",
      finalDeliveryStatus: "FAILED",
      finalDeliveryError: expect.stringContaining("missing provider identifier"),
    });
  });

  it.each([
    ["opening reply", "opening_reply"],
    ["protected delivery", "final_delivery"],
  ] as const)("fails closed after ambiguous %s acceptance and never blindly resends", async (_label, action) => {
    const client = createClient({
      ...(action === "opening_reply"
        ? { sendPrivateReply: vi.fn().mockRejectedValue(new MetaApiError("response lost", 0, true)) }
        : { sendDirectMessage: vi.fn().mockRejectedValue(new MetaApiError("response lost", 0, true)) }),
    });
    const harness = await createHarness(client);

    if (action === "opening_reply") {
      await processCampaignEvent(commentEvent, automation, harness.mapping, harness.repository, harness.options);
      await processCampaignEvent(commentEvent, automation, harness.mapping, harness.repository, harness.options);
      expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
      expect(await readParticipant(harness.repository)).toMatchObject({
        state: "FAILED",
        openingStatus: "FAILED",
        openingError: expect.stringContaining("ambiguous"),
      });
    } else {
      await processCampaignEvent(commentEvent, automation, harness.mapping, harness.repository, harness.options);
      const opening = vi.mocked(client.sendPrivateReply).mock.calls[0]?.[2];
      if (typeof opening === "string" || !opening?.quickReply) throw new Error("opening payload missing");
      const event = interactionEvent(opening.quickReply.payload, NOW + 1_000);
      await processPendingCampaignInteraction(event, harness.mapping, harness.repository, harness.options);
      await processPendingCampaignInteraction(event, harness.mapping, harness.repository, harness.options);
      expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
      expect(await readParticipant(harness.repository)).toMatchObject({
        state: "FAILED",
        finalDeliveryStatus: "FAILED",
        finalDeliveryError: expect.stringContaining("ambiguous"),
      });
    }

    const execution = await harness.repository.getExecution(
      automation.workspaceId,
      `campaign:${(await readParticipant(harness.repository)).id}:${action}`,
    );
    expect(execution).toMatchObject({ status: "FAILED", dispatchStatus: "DISPATCHING" });
    expect(execution?.reason).toContain("ambiguous");
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

  it("sends a wait notice instead of silence when a recheck violates the cooldown", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    vi.setSystemTime(optInEvent.timestamp);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = vi.mocked(harness.client.sendQuickReply).mock.calls[0]?.[3]?.payload;
    if (!recheckPayload) throw new Error("recheck payload was not sent");

    await processPendingCampaignInteraction(
      interactionEvent(recheckPayload, optInEvent.timestamp + 5_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(1);
    expect((await readParticipant(harness.repository)).recheckCount).toBe(0);
    expect(harness.client.sendQuickReply).toHaveBeenCalledTimes(2);
    expect(vi.mocked(harness.client.sendQuickReply).mock.calls[1]?.[2]).toMatch(/few more seconds/i);
    const noticePayload = vi.mocked(harness.client.sendQuickReply).mock.calls[1]?.[3]?.payload;
    expect(typeof noticePayload).toBe("string");
    expect(noticePayload).not.toBe(recheckPayload);
  });

  it("does not resend the cooldown notice for a replayed cooldown-violating event", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    vi.setSystemTime(optInEvent.timestamp);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = vi.mocked(harness.client.sendQuickReply).mock.calls[0]?.[3]?.payload;
    if (!recheckPayload) throw new Error("recheck payload was not sent");

    const violatingEvent = interactionEvent(recheckPayload, optInEvent.timestamp + 5_000, { id: "recheck_replay" });
    await processPendingCampaignInteraction(violatingEvent, harness.mapping, harness.repository, harness.options);
    await processPendingCampaignInteraction(violatingEvent, harness.mapping, harness.repository, harness.options);

    expect(harness.client.sendQuickReply).toHaveBeenCalledTimes(2);
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
    const validAtBoundaryPayload = createInteractionPayload(
      { participantId: harness.participant.id, action: "recheck" },
      INTERACTION_SECRET,
      expiresAt - 1_000,
    );

    await processPendingCampaignInteraction(
      interactionEvent(validAtBoundaryPayload, expiresAt),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(await readParticipant(harness.repository)).toMatchObject({ state: "EXPIRED" });
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(1);
    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
  });

  it("accepts a valid recheck one millisecond before the messaging window closes", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus)
      .mockResolvedValueOnce({ isUserFollowingBusiness: false })
      .mockResolvedValueOnce({ isUserFollowingBusiness: true });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = vi.mocked(harness.client.sendQuickReply).mock.calls[0]?.[3]?.payload;
    if (!recheckPayload) throw new Error("recheck payload was not sent");

    await processPendingCampaignInteraction(
      interactionEvent(recheckPayload, optInEvent.timestamp + 24 * 60 * 60 * 1_000 - 1),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(await readParticipant(harness.repository)).toMatchObject({ state: "LINK_SENT" });
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
  });

  it("allows only one concurrent final-delivery dispatch", async () => {
    const harness = await openParticipant();
    await harness.repository.transitionParticipant(harness.participant.id, ["OPENING_SENT"], {
      state: "FOLLOW_VERIFIED",
      followStatus: true,
      followCheckedAt: new Date(NOW + 1_000).toISOString(),
      messagingWindowExpiresAt: new Date(NOW + 60_000).toISOString(),
      finalDeliveryStatus: "PENDING",
    });
    const payload = createInteractionPayload(
      { participantId: harness.participant.id, action: "recheck" },
      INTERACTION_SECRET,
      NOW,
    );
    let releaseSend: (() => void) | undefined;
    vi.mocked(harness.client.sendDirectMessage).mockImplementation(() => new Promise((resolve) => {
      releaseSend = () => resolve({ recipient_id: "scoped_user_1", message_id: "final_concurrent" });
    }));

    const first = processPendingCampaignInteraction(
      interactionEvent(payload, NOW + 1_000, { id: "final_concurrent_a" }),
      harness.mapping,
      harness.repository,
      harness.options,
    );
    await vi.waitFor(() => expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1));
    const second = processPendingCampaignInteraction(
      interactionEvent(payload, NOW + 1_000, { id: "final_concurrent_b" }),
      harness.mapping,
      harness.repository,
      harness.options,
    );
    releaseSend?.();
    await Promise.all([first, second]);

    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "LINK_SENT",
      finalDeliveryStatus: "SENT",
      finalProviderId: "final_concurrent",
    });
  });

  it("keeps an unexpired foreign dispatch live across independent worker module contexts", async () => {
    const harness = await openParticipant();
    await harness.repository.transitionParticipant(harness.participant.id, ["OPENING_SENT"], {
      state: "FOLLOW_VERIFIED",
      followStatus: true,
      followCheckedAt: new Date(NOW + 1_000).toISOString(),
      messagingWindowExpiresAt: new Date(NOW + 60_000).toISOString(),
      finalDeliveryStatus: "PENDING",
    });
    const payload = createInteractionPayload(
      { participantId: harness.participant.id, action: "recheck" },
      INTERACTION_SECRET,
      NOW,
    );
    let releaseSend: (() => void) | undefined;
    vi.mocked(harness.client.sendDirectMessage).mockImplementation(() => new Promise((resolve) => {
      releaseSend = () => resolve({ recipient_id: "scoped_user_1", message_id: "final_cross_worker" });
    }));
    vi.resetModules();
    const workerA = await import("./campaign-runner");
    vi.resetModules();
    const workerB = await import("./campaign-runner");
    const event = interactionEvent(payload, NOW + 1_000, { id: "final_cross_worker_event" });

    const first = workerA.processPendingCampaignInteraction(
      event,
      harness.mapping,
      harness.repository,
      harness.options,
    );
    await vi.waitFor(() => expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1));
    const second = await workerB.processPendingCampaignInteraction(
      { ...event, id: "final_cross_worker_duplicate" },
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(second).toMatchObject({ handled: true });
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "FOLLOW_VERIFIED",
      finalDeliveryStatus: "PENDING",
    });
    expect(await harness.repository.getExecution(
      automation.workspaceId,
      `campaign:${harness.participant.id}:final_delivery`,
    )).toMatchObject({
      status: "PROCESSING",
      dispatchStatus: "DISPATCHING",
      dispatchOwner: expect.any(String),
    });

    releaseSend?.();
    await first;

    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "LINK_SENT",
      finalDeliveryStatus: "SENT",
      finalProviderId: "final_cross_worker",
    });
  });

  it("fails a historical PROCESSING claim without durable ownership instead of resending", async () => {
    const harness = await openParticipant();
    await harness.repository.transitionParticipant(harness.participant.id, ["OPENING_SENT"], {
      state: "FOLLOW_VERIFIED",
      followStatus: true,
      followCheckedAt: new Date(NOW + 1_000).toISOString(),
      messagingWindowExpiresAt: new Date(NOW + 60_000).toISOString(),
      finalDeliveryStatus: "PENDING",
    });
    const dedupeKey = `campaign:${harness.participant.id}:final_delivery`;
    await harness.repository.claimExecution({
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      externalEventId: "crashed_before_dispatch",
      dedupeKey,
    });
    const payload = createInteractionPayload(
      { participantId: harness.participant.id, action: "recheck" },
      INTERACTION_SECRET,
      NOW,
    );

    await processPendingCampaignInteraction(
      interactionEvent(payload, NOW + 1_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "FAILED",
      finalDeliveryStatus: "FAILED",
      finalDeliveryError: expect.stringContaining("durable dispatch owner"),
    });
    expect(await harness.repository.getExecution(automation.workspaceId, dedupeKey)).toMatchObject({
      status: "FAILED",
      dispatchStatus: "CLAIMED",
    });
  });

  it("does not resume protected delivery from a stale prior true follow status", async () => {
    const harness = await openParticipant();
    await harness.repository.transitionParticipant(harness.participant.id, ["OPENING_SENT"], {
      state: "FOLLOW_VERIFIED",
      followStatus: true,
      followCheckedAt: new Date(NOW).toISOString(),
      messagingWindowExpiresAt: new Date(NOW + 60_000).toISOString(),
      finalDeliveryStatus: "PENDING",
    });
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const payload = createInteractionPayload(
      { participantId: harness.participant.id, action: "recheck" },
      INTERACTION_SECRET,
      NOW,
    );

    await processPendingCampaignInteraction(
      interactionEvent(payload, NOW + 10_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(1);
    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "FAILED",
      followCheckError: "Follower status changed before delivery",
    });
  });

  it("fails closed on a historical DISPATCHING execution without an owner", async () => {
    const harness = await openParticipant();
    await harness.repository.transitionParticipant(harness.participant.id, ["OPENING_SENT"], {
      state: "FOLLOW_VERIFIED",
      followStatus: true,
      followCheckedAt: new Date(NOW + 1_000).toISOString(),
      messagingWindowExpiresAt: new Date(NOW + 60_000).toISOString(),
      finalDeliveryStatus: "PENDING",
    });
    const dedupeKey = `campaign:${harness.participant.id}:final_delivery`;
    await harness.repository.recordExecution({
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      externalEventId: "crashed_during_dispatch",
      dedupeKey,
      status: "PROCESSING",
      dispatchStatus: "DISPATCHING",
    });
    const payload = createInteractionPayload(
      { participantId: harness.participant.id, action: "recheck" },
      INTERACTION_SECRET,
      NOW,
    );

    await processPendingCampaignInteraction(
      interactionEvent(payload, NOW + 1_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "FAILED",
      finalDeliveryStatus: "FAILED",
      finalDeliveryError: expect.stringContaining("ambiguous"),
    });
    expect(await harness.repository.getExecution(automation.workspaceId, dedupeKey)).toMatchObject({
      status: "FAILED",
      dispatchStatus: "DISPATCHING",
    });
  });

  it("fails closed on an owned dispatch whose durable lease expired", async () => {
    const harness = await openParticipant();
    await harness.repository.transitionParticipant(harness.participant.id, ["OPENING_SENT"], {
      state: "FOLLOW_VERIFIED",
      followStatus: true,
      followCheckedAt: new Date(NOW + 1_000).toISOString(),
      messagingWindowExpiresAt: new Date(NOW + 60_000).toISOString(),
      finalDeliveryStatus: "PENDING",
    });
    const dedupeKey = `campaign:${harness.participant.id}:final_delivery`;
    await harness.repository.claimExecutionDispatch({
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      externalEventId: "expired_dispatch_owner",
      dedupeKey,
      dispatchOwner: "expired_owner",
      dispatchStartedAt: new Date(NOW - 30_000).toISOString(),
      dispatchLeaseExpiresAt: new Date(NOW).toISOString(),
    });
    const payload = createInteractionPayload(
      { participantId: harness.participant.id, action: "recheck" },
      INTERACTION_SECRET,
      NOW,
    );

    await processPendingCampaignInteraction(
      interactionEvent(payload, NOW + 1_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "FAILED",
      finalDeliveryStatus: "FAILED",
      finalDeliveryError: expect.stringContaining("abandoned dispatch lease"),
    });
    expect(await harness.repository.getExecution(automation.workspaceId, dedupeKey)).toMatchObject({
      status: "FAILED",
      dispatchOwner: "expired_owner",
    });
  });

  it("ignores unrelated payloads but consumes invalid campaign payloads without mutation", async () => {
    const harness = await openParticipant();
    const otherPayload = createInteractionPayload(
      { participantId: "participant_other", action: "opt_in" },
      INTERACTION_SECRET,
      NOW,
    );

    await expect(processPendingCampaignInteraction(
      interactionEvent("invalid", NOW + 1_000),
      harness.mapping,
      harness.repository,
      harness.options,
    )).resolves.toEqual({ handled: false });

    for (const payload of [`${harness.optInPayload}tampered`, otherPayload]) {
      await expect(processPendingCampaignInteraction(
        interactionEvent(payload, NOW + 1_000),
        harness.mapping,
        harness.repository,
        harness.options,
      )).resolves.toMatchObject({ handled: true });
    }

    expect(await readParticipant(harness.repository)).toMatchObject({ state: "OPENING_SENT" });
    expect(harness.client.getUserFollowStatus).not.toHaveBeenCalled();
    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
  });

  it("verifies the signed payload before expiry and never mutates on a tampered interaction", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = vi.mocked(harness.client.sendQuickReply).mock.calls[0]?.[3]?.payload;
    if (!recheckPayload) throw new Error("recheck payload was not sent");
    const expiresAt = optInEvent.timestamp + 24 * 60 * 60 * 1_000;

    const result = await processPendingCampaignInteraction(
      interactionEvent(`${recheckPayload}tampered`, expiresAt),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(result).toMatchObject({ handled: true });
    expect(await readParticipant(harness.repository)).toMatchObject({ state: "FOLLOW_REQUIRED" });
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["account", { accountId: "ig_business_other" }, { workspaceId: automation.workspaceId }],
    ["sender", { recipientId: "scoped_user_other" }, { workspaceId: automation.workspaceId }],
    ["workspace", {}, { workspaceId: "workspace_other" }],
  ])("consumes a signed interaction with mismatched %s identity without mutation", async (
    _label,
    eventOverrides,
    mappingOverrides,
  ) => {
    const harness = await openParticipant();

    const result = await processPendingCampaignInteraction(
      interactionEvent(harness.optInPayload, NOW + 1_000, eventOverrides),
      { ...harness.mapping, ...mappingOverrides },
      harness.repository,
      harness.options,
    );

    expect(result).toMatchObject({ handled: true });
    expect(await readParticipant(harness.repository)).toMatchObject({ state: "OPENING_SENT" });
    expect(harness.client.getUserFollowStatus).not.toHaveBeenCalled();
  });

  it("resolves the signed participant ID when one sender has multiple pending campaigns", async () => {
    const harness = await openParticipant();
    const second = await harness.repository.createParticipant({
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      instagramAccountId: commentEvent.accountId,
      igScopedUserId: "scoped_user_1",
      sourceCommentId: "comment_second",
      sourceMediaId: sourceSnapshot.id,
      sourceMediaSnapshot: sourceSnapshot,
      state: "OPENING_SENT",
      openingStatus: "SENT",
      openingProviderId: "opening_second",
    });
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: true });

    await processPendingCampaignInteraction(
      interactionEvent(harness.optInPayload, NOW + 1_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(await harness.repository.getParticipant(
      automation.workspaceId,
      commentEvent.accountId,
      harness.participant.id,
    )).toMatchObject({ state: "LINK_SENT" });
    expect(await harness.repository.getParticipant(
      automation.workspaceId,
      commentEvent.accountId,
      second.record.id,
    )).toMatchObject({ state: "OPENING_SENT" });
  });

  it("does not treat a recheck-purpose payload as opt-in consent", async () => {
    const harness = await openParticipant();
    const deniedPayload = createInteractionPayload(
      { participantId: harness.participant.id, action: "recheck" },
      INTERACTION_SECRET,
      NOW,
    );

    const result = await processPendingCampaignInteraction(
      interactionEvent(deniedPayload, NOW + 1_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(result).toMatchObject({ handled: true });
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

  it("releases the follow-check claim and rethrows on a retryable Meta error instead of failing the participant", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus)
      .mockRejectedValueOnce(new MetaApiError("temporarily unavailable", 503))
      .mockResolvedValueOnce({ isUserFollowingBusiness: true });

    await expect(
      processPendingCampaignInteraction(
        interactionEvent(harness.optInPayload, NOW + 1_000),
        harness.mapping,
        harness.repository,
        harness.options,
      ),
    ).rejects.toThrow("temporarily unavailable");

    const afterFailure = await readParticipant(harness.repository);
    expect(afterFailure.state).not.toBe("FAILED");
    expect(afterFailure.state).toBe("OPTED_IN");
    expect(afterFailure.followCheckError).toBeUndefined();

    const result = await processPendingCampaignInteraction(
      interactionEvent(harness.optInPayload, NOW + 1_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(result).toMatchObject({ handled: true, result: { sent: 1 } });
    expect(await readParticipant(harness.repository)).toMatchObject({ state: "LINK_SENT" });
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(2);
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

describe("campaign expansion behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delivers immediately on opt-in when the follow gate is disabled", async () => {
    const ungatedAutomation: AutomationRecord = {
      ...automation,
      id: "automation_ungated",
      definition: { ...definition, followGate: { ...definition.followGate, required: false } },
    };
    const followSpy = vi.fn();
    const client = createClient({ getUserFollowStatus: followSpy });
    const repository = createMemoryRepository([ungatedAutomation]);
    await repository.upsertConnection({
      workspaceId: automation.workspaceId,
      igUserId: commentEvent.accountId,
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
      status: "CONNECTED",
    });
    const mapping = await repository.findWorkspaceByInstagramAccount(commentEvent.accountId);
    if (!mapping) throw new Error("missing mapping");
    const options: CampaignRunnerOptions = { client, tokenEncryptionKey: TOKEN_KEY, interactionSecret: INTERACTION_SECRET };

    await processCampaignEvent(commentEvent, ungatedAutomation, mapping, repository, options);
    const openingCall = vi.mocked(client.sendPrivateReply).mock.calls[0];
    const payload = (openingCall?.[2] as { quickReply?: { payload: string } }).quickReply?.payload;
    if (!payload) throw new Error("opening quick reply was not sent");

    const result = await processPendingCampaignInteraction(
      interactionEvent(payload, NOW + 1_000),
      mapping,
      repository,
      options,
    );

    expect(followSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ handled: true, result: { sent: 1 } });
    const [updated] = await repository.listParticipants(ungatedAutomation.workspaceId, ungatedAutomation.id, 1);
    expect(updated.state).toBe("LINK_SENT");
  });

  it("skips comments outside the scheduled window without creating participants", async () => {
    const scheduledAutomation: AutomationRecord = {
      ...automation,
      id: "automation_scheduled",
      definition: { ...definition, schedule: { endsAt: new Date(NOW - 1_000).toISOString() } },
    };
    const client = createClient();
    const repository = createMemoryRepository([scheduledAutomation]);
    await repository.upsertConnection({
      workspaceId: automation.workspaceId,
      igUserId: commentEvent.accountId,
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
      status: "CONNECTED",
    });
    const mapping = await repository.findWorkspaceByInstagramAccount(commentEvent.accountId);
    if (!mapping) throw new Error("missing mapping");
    const options: CampaignRunnerOptions = { client, tokenEncryptionKey: TOKEN_KEY, interactionSecret: INTERACTION_SECRET };

    const result = await processCampaignEvent(commentEvent, scheduledAutomation, mapping, repository, options);

    expect(result).toMatchObject({ handled: true, skipped: 1 });
    expect(await repository.listParticipants(scheduledAutomation.workspaceId, scheduledAutomation.id, 10)).toHaveLength(0);
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
  });
});
