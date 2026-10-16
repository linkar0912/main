import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { MetaApiError, MetaClient } from "../meta/client";
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
  processExistingCampaignParticipant,
  processPendingCampaignInteraction,
  type CampaignRunnerClient,
  type CampaignRunnerOptions,
} from "./campaign-runner";
import { deliveryKeys } from "./outbound-delivery";
import {
  checkSendRateLimit,
  publicReplyCommentPosition,
  publicReplySkipMessage,
  resetSendRateLimitFallback,
} from "./send-rate-limiter";
import {
  checkAccountSendGate,
  recordAccountBlock,
  recordAccountThrottle,
  resetAccountPauseStateForTests,
  type SendPauseTarget,
} from "./account-pause";
import { findSendDeferral } from "./send-deferral";
import {
  ACCOUNT_RECOVERING_REASON,
  ACCOUNT_THROTTLED_REASON,
  META_ERROR_REASONS,
  parseAccountPauseReason,
} from "../meta/errors";

// The real hourly ceiling, wrapped so a test can make it hold one send
// (without Redis it never holds a realtime DM on its own).
vi.mock("./send-rate-limiter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./send-rate-limiter")>();
  return { ...actual, checkSendRateLimit: vi.fn(actual.checkSendRateLimit) };
});

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
  publicReplies: ["Sent - check your messages", "It is on its way"],
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
  provider: "INSTAGRAM",
  name: "Follow-gated guide",
  status: "ACTIVE",
  version: 2,
  priority: 0,
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

/** What the real Meta client throws when Graph throttles the account with this code on HTTP 400. */
async function metaThrottleError(code: number): Promise<MetaApiError> {
  const client = new MetaClient({
    apiVersion: "v25.0",
    fetcher: async () => new Response(JSON.stringify({
      error: { message: "There have been too many calls to this Instagram account. Wait a bit and try again.", code },
    }), { status: 400 }),
  });
  const error = await client.getMedia({ igUserId: "ig_business_1", accessToken: "token" }, "media_1")
    .catch((thrown: unknown) => thrown);
  if (!(error instanceof MetaApiError)) throw new Error("expected a MetaApiError");
  return error;
}

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

function postbackPayload(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const buttons = (message as { buttons?: unknown }).buttons;
  if (!Array.isArray(buttons)) return undefined;
  const button = buttons.find((candidate) => (
    typeof candidate === "object"
    && candidate !== null
    && (candidate as { type?: unknown }).type === "postback"
  ));
  return typeof (button as { payload?: unknown } | undefined)?.payload === "string"
    ? (button as { payload: string }).payload
    : undefined;
}

function openingPostbackPayload(client: CampaignRunnerClient): string {
  const opening = vi.mocked(client.sendPrivateReply).mock.calls[0]?.[2];
  const payload = postbackPayload(opening);
  if (!payload) throw new Error("opening postback button was not sent");
  return payload;
}

function directPostbackPayload(client: CampaignRunnerClient, callIndex = 0): string {
  const message = vi.mocked(client.sendDirectMessage).mock.calls[callIndex]?.[2];
  const payload = postbackPayload(message);
  if (!payload) throw new Error("direct-message postback button was not sent");
  return payload;
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
  return { ...harness, participant, optInPayload: openingPostbackPayload(client) };
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
    // Tests run without Redis, so public replies draw on the in-process
    // fallback budget; start every test with it empty.
    resetSendRateLimitFallback();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records campaign provider calls in the shared outbound ledger", async () => {
    const harness = await createHarness();

    await processCampaignEvent(
      commentEvent,
      automation,
      harness.mapping,
      harness.repository,
      harness.options,
    );
    const participant = await readParticipant(harness.repository);

    expect(await harness.repository.getOutboundDelivery(
      deliveryKeys.campaignAction(participant.id, "opening_reply"),
    )).toMatchObject({
      state: "SENT",
      kind: "CAMPAIGN_ACTION",
      providerMessageId: "opening_message_1",
    });
  });

  it("counts campaign limits by outbound message rather than participant events", async () => {
    const limitedAutomation: AutomationRecord = {
      ...automation,
      id: "automation_campaign_limited",
      definition: { ...definition, publicReplies: [], dailySendLimit: 1 },
    };
    const repository = createMemoryRepository([limitedAutomation]);
    await repository.upsertConnection({
      workspaceId: limitedAutomation.workspaceId,
      igUserId: commentEvent.accountId,
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
      status: "CONNECTED",
    });
    const mapping = await repository.findWorkspaceByInstagramAccount(commentEvent.accountId);
    if (!mapping) throw new Error("test connection mapping was not created");
    const client = createClient();
    const options: CampaignRunnerOptions = {
      client,
      tokenEncryptionKey: TOKEN_KEY,
      interactionSecret: INTERACTION_SECRET,
    };

    await processCampaignEvent(commentEvent, limitedAutomation, mapping, repository, options);
    await processPendingCampaignInteraction(
      interactionEvent(openingPostbackPayload(client), NOW + 1_000),
      mapping,
      repository,
      options,
    );

    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(client.sendDirectMessage).not.toHaveBeenCalled();
    const [participant] = await repository.listParticipants(
      limitedAutomation.workspaceId,
      limitedAutomation.id,
      1,
    );
    expect(participant).toMatchObject({
      finalDeliveryStatus: "SKIPPED",
      finalDeliveryError: "daily_send_limit_reached",
    });
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
      buttons: [{ type: "postback", title: definition.openingMessage.optInButtonLabel }],
    });
    expect(readInteractionPayload(openingPostbackPayload(client), INTERACTION_SECRET, NOW)).toEqual({
      participantId: participant.id,
      action: "opt_in",
    });
  });

  it.each([
    ["embedded keyword", { text: "Please send the guidelines" }],
    ["different media", { mediaId: "media_other" }],
  ])("does not create a participant or send for an unmatched %s comment", async (_case, eventPatch) => {
    const { client, repository, mapping, options } = await createHarness();

    const result = await processCampaignEvent(
      { ...commentEvent, ...eventPatch },
      automation,
      mapping,
      repository,
      options,
    );

    expect(result).toEqual({ handled: false, matched: 0, sent: 0, skipped: 0, failed: 0 });
    expect(await repository.listParticipants(automation.workspaceId, automation.id, 10)).toHaveLength(0);
    expect(client.replyToComment).not.toHaveBeenCalled();
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("starts the private reply without waiting for the public reply to finish", async () => {
    vi.useRealTimers();
    let releasePublicReply!: (value: { id: string }) => void;
    const pendingPublicReply = new Promise<{ id: string }>((resolve) => {
      releasePublicReply = resolve;
    });
    const client = createClient({
      replyToComment: vi.fn(() => pendingPublicReply),
    });
    const { repository, mapping, options } = await createHarness(client);
    // Real timers: the comment must be fresh, or the 7-day private reply check skips it.
    const freshComment = { ...commentEvent, timestamp: Date.now() };

    const processing = processCampaignEvent(freshComment, automation, mapping, repository, options);
    await vi.waitFor(() => expect(client.replyToComment).toHaveBeenCalledTimes(1));
    const privateReplyStartedBeforePublicFinished = await vi.waitFor(
      () => {
        expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
        return true;
      },
      { timeout: 100 },
    ).then(() => true, () => false);

    releasePublicReply({ id: "public_reply_1" });
    await processing;

    expect(privateReplyStartedBeforePublicFinished).toBe(true);
  });

  it("records a concurrent public reply that finishes after the opening reply fails", async () => {
    vi.useRealTimers();
    let releasePublicReply!: (value: { id: string }) => void;
    const pendingPublicReply = new Promise<{ id: string }>((resolve) => {
      releasePublicReply = resolve;
    });
    const client = createClient({
      replyToComment: vi.fn(() => pendingPublicReply),
      sendPrivateReply: vi.fn().mockRejectedValue(new MetaApiError("invalid private reply", 400)),
    });
    const { repository, mapping, options } = await createHarness(client);
    // Real timers: the comment must be fresh, or the 7-day private reply check skips it.
    const freshComment = { ...commentEvent, timestamp: Date.now() };

    const processing = processCampaignEvent(freshComment, automation, mapping, repository, options);
    await vi.waitFor(async () => {
      expect((await readParticipant(repository)).state).toBe("FAILED");
    });
    releasePublicReply({ id: "public_reply_after_failure" });
    await processing;

    expect(await readParticipant(repository)).toMatchObject({
      state: "FAILED",
      openingStatus: "FAILED",
      publicReplyStatus: "SENT",
      publicReplyProviderId: "public_reply_after_failure",
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

  it("asks Meta for follow status on an opt-in tap before the opt-in bookkeeping finishes", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: true });
    const order: string[] = [];
    vi.mocked(harness.client.getUserFollowStatus).mockImplementation(async () => {
      order.push("follow_status");
      return { isUserFollowingBusiness: true };
    });
    const claimExecution = harness.repository.claimExecution.bind(harness.repository);
    vi.spyOn(harness.repository, "claimExecution").mockImplementation(async (input) => {
      order.push("claim");
      return claimExecution(input);
    });

    const result = await processPendingCampaignInteraction(
      interactionEvent(harness.optInPayload, NOW + 1_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(result).toMatchObject({ handled: true, result: { sent: 1 } });
    expect(order.indexOf("follow_status")).toBeLessThan(order.indexOf("claim"));
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(1);
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
  });

  it("resolves the participant's campaign from preloaded automations without a database read", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: true });
    const getAutomation = vi.spyOn(harness.repository, "getAutomation");

    const result = await processPendingCampaignInteraction(
      interactionEvent(harness.optInPayload, NOW + 1_000),
      harness.mapping,
      harness.repository,
      { ...harness.options, activeAutomations: [automation] },
    );

    expect(result).toMatchObject({ handled: true, result: { sent: 1 } });
    expect(getAutomation).not.toHaveBeenCalled();
  });

  it("skips the per-campaign participant lookup when the caller already checked the comment", async () => {
    const harness = await createHarness();
    const findParticipantBySource = vi.spyOn(harness.repository, "findParticipantBySource");
    const getAutomation = vi.spyOn(harness.repository, "getAutomation");

    const result = await processCampaignEvent(
      commentEvent,
      automation,
      harness.mapping,
      harness.repository,
      { ...harness.options, sourceParticipantChecked: true },
    );

    expect(result).toMatchObject({ handled: true, sent: 1 });
    expect(findParticipantBySource).not.toHaveBeenCalled();
    // The new participant's campaign is the one just matched - no re-read.
    expect(getAutomation).not.toHaveBeenCalled();
  });

  it("prompts an opted-in non-follower with attached profile and signed recheck buttons", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const event = interactionEvent(harness.optInPayload, NOW + 1_000);

    await processPendingCampaignInteraction(event, harness.mapping, harness.repository, harness.options);

    expect(harness.client.sendQuickReply).not.toHaveBeenCalled();
    expect(harness.client.sendDirectMessage).toHaveBeenCalledWith(
      { igUserId: commentEvent.accountId, accessToken: "access-token" },
      "scoped_user_1",
      {
        type: "button_template",
        text: definition.followGate.notFollowingMessage,
        buttons: [
          { type: "web_url", title: "Visit Profile", url: "https://www.instagram.com/creator/" },
          { type: "postback", title: definition.followGate.recheckButtonLabel, payload: expect.any(String) },
        ],
      },
    );
    const prompt = vi.mocked(harness.client.sendDirectMessage).mock.calls[0]?.[2];
    const recheckButton = prompt?.type === "button_template"
      ? prompt.buttons.find((button) => button.type === "postback")
      : undefined;
    expect(readInteractionPayload(recheckButton?.payload ?? "", INTERACTION_SECRET, event.timestamp)).toEqual({
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
    const recheckPayload = directPostbackPayload(harness.client);
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValueOnce({ isUserFollowingBusiness: true });
    const recheckEvent = interactionEvent(recheckPayload, optInEvent.timestamp + 10_000);

    await processPendingCampaignInteraction(recheckEvent, harness.mapping, harness.repository, harness.options);
    await processPendingCampaignInteraction(recheckEvent, harness.mapping, harness.repository, harness.options);

    expect(await readParticipant(harness.repository)).toMatchObject({ state: "LINK_SENT", followStatus: true });
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(2);
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(2);
  });

  it("resumes a retryable pending final delivery before recheck cooldown or another profile lookup", async () => {
    const client = createClient({
      getUserFollowStatus: vi.fn()
        .mockResolvedValueOnce({ isUserFollowingBusiness: false })
        .mockResolvedValueOnce({ isUserFollowingBusiness: true }),
      sendDirectMessage: vi.fn()
        .mockResolvedValueOnce({ recipient_id: "scoped_user_1", message_id: "follow_prompt_1" })
        .mockRejectedValueOnce(new MetaApiError("temporarily unavailable", 503))
        .mockResolvedValueOnce({ recipient_id: "scoped_user_1", message_id: "final_message_retry" }),
    });
    const harness = await openParticipant(client);
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = directPostbackPayload(client);
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
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(3);
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
      const event = interactionEvent(openingPostbackPayload(client), NOW + 1_000);
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
    const recheckPayload = directPostbackPayload(harness.client);
    const recheckEvent = interactionEvent(recheckPayload, optInEvent.timestamp + 10_000);

    await processPendingCampaignInteraction(recheckEvent, harness.mapping, harness.repository, harness.options);

    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "FOLLOW_REQUIRED",
      followStatus: false,
      recheckCount: 1,
      followCheckedAt: new Date(recheckEvent.timestamp).toISOString(),
    });
    expect(harness.client.sendQuickReply).not.toHaveBeenCalled();
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(2);
  });

  it("rejects a recheck before 10 seconds and accepts the exact cooldown boundary", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    vi.setSystemTime(optInEvent.timestamp);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = directPostbackPayload(harness.client);

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
    const recheckPayload = directPostbackPayload(harness.client);

    await processPendingCampaignInteraction(
      interactionEvent(recheckPayload, optInEvent.timestamp + 5_000),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(1);
    expect((await readParticipant(harness.repository)).recheckCount).toBe(0);
    expect(harness.client.sendQuickReply).not.toHaveBeenCalled();
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(2);
    const noticeMessage = vi.mocked(harness.client.sendDirectMessage).mock.calls[1]?.[2];
    expect(noticeMessage?.type === "button_template" ? noticeMessage.text : undefined).toMatch(/few more seconds/i);
    const noticePayload = directPostbackPayload(harness.client, 1);
    expect(typeof noticePayload).toBe("string");
    expect(noticePayload).not.toBe(recheckPayload);
  });

  it("does not resend the cooldown notice for a replayed cooldown-violating event", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    vi.setSystemTime(optInEvent.timestamp);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = directPostbackPayload(harness.client);

    const violatingEvent = interactionEvent(recheckPayload, optInEvent.timestamp + 5_000, { id: "recheck_replay" });
    await processPendingCampaignInteraction(violatingEvent, harness.mapping, harness.repository, harness.options);
    await processPendingCampaignInteraction(violatingEvent, harness.mapping, harness.repository, harness.options);

    expect(harness.client.sendQuickReply).not.toHaveBeenCalled();
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(2);
  });

  it("allows only one competing recheck to claim the next cooldown slot", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    vi.setSystemTime(optInEvent.timestamp);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = directPostbackPayload(harness.client);
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
    expect(harness.client.sendQuickReply).not.toHaveBeenCalled();
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(2);
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
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
  });

  it("accepts a valid recheck one millisecond before the messaging window closes", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus)
      .mockResolvedValueOnce({ isUserFollowingBusiness: false })
      .mockResolvedValueOnce({ isUserFollowingBusiness: true });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    const recheckPayload = directPostbackPayload(harness.client);

    await processPendingCampaignInteraction(
      interactionEvent(recheckPayload, optInEvent.timestamp + 24 * 60 * 60 * 1_000 - 1),
      harness.mapping,
      harness.repository,
      harness.options,
    );

    expect(await readParticipant(harness.repository)).toMatchObject({ state: "LINK_SENT" });
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(2);
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
    const recheckPayload = directPostbackPayload(harness.client);
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
    resetSendRateLimitFallback();
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
    const payload = postbackPayload(openingCall?.[2]);
    if (!payload) throw new Error("opening postback button was not sent");

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

describe("campaign send safety", () => {
  const DAY_MS = 24 * 60 * 60 * 1_000;
  const originalRedisUrl = process.env.REDIS_URL;
  const originalCommentLimit = process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // No Redis: public replies use the in-process fallback, a quarter of the
    // hourly budget. 40 an hour gives a fallback budget of 10.
    delete process.env.REDIS_URL;
    process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = "40";
    resetSendRateLimitFallback();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSendRateLimitFallback();
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
    if (originalCommentLimit === undefined) delete process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR;
    else process.env.COMMENT_REPLY_RATE_LIMIT_PER_HOUR = originalCommentLimit;
  });

  async function useCommentReplies(count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      expect((await checkSendRateLimit(commentEvent.accountId, "comment_reply")).allowed).toBe(true);
    }
  }

  it("skips the public reply once the hourly budget is used, and still sends the private reply", async () => {
    await useCommentReplies(10);
    const { client, repository, mapping, options } = await createHarness();

    const result = await processCampaignEvent(commentEvent, automation, mapping, repository, options);

    expect(result).toMatchObject({ handled: true, sent: 1 });
    expect(client.replyToComment).not.toHaveBeenCalled();
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(await readParticipant(repository)).toMatchObject({
      state: "OPENING_SENT",
      openingStatus: "SENT",
      publicReplyStatus: "SKIPPED",
      publicReplyError: publicReplySkipMessage("public_reply_hourly_limit"),
    });
  });

  it("does not defer or retry a skipped public reply", async () => {
    await useCommentReplies(10);
    const { client, repository, mapping, options } = await createHarness();
    await processCampaignEvent(commentEvent, automation, mapping, repository, options);
    // The budget resets, but the skipped reply stays skipped on redelivery.
    resetSendRateLimitFallback();

    await processCampaignEvent(commentEvent, automation, mapping, repository, options);

    expect(client.replyToComment).not.toHaveBeenCalled();
    expect(await readParticipant(repository)).toMatchObject({ publicReplyStatus: "SKIPPED" });
  });

  it("thins out public replies past half the budget, deterministically by comment", async () => {
    // 9 of 10 used: only comments in the first 20% still get a public reply.
    expect(publicReplyCommentPosition(commentEvent.commentId!)).toBeGreaterThanOrEqual(0.2);
    await useCommentReplies(9);
    const { client, repository, mapping, options } = await createHarness();

    await processCampaignEvent(commentEvent, automation, mapping, repository, options);

    expect(client.replyToComment).not.toHaveBeenCalled();
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(await readParticipant(repository)).toMatchObject({
      publicReplyStatus: "SKIPPED",
      publicReplyError: publicReplySkipMessage("public_reply_tapered"),
    });
  });

  it("still replies publicly to a comment early in the taper order", async () => {
    expect(publicReplyCommentPosition("comment_a")).toBeLessThan(0.2);
    await useCommentReplies(9);
    const { client, repository, mapping, options } = await createHarness();
    const earlyComment = { ...commentEvent, id: "comment_a", commentId: "comment_a" };

    await processCampaignEvent(earlyComment, automation, mapping, repository, options);

    expect(client.replyToComment).toHaveBeenCalledTimes(1);
    expect(await readParticipant(repository)).toMatchObject({ publicReplyStatus: "SENT" });
  });

  it("does not count a skipped public reply against the daily send limit", async () => {
    await useCommentReplies(10);
    const limitedAutomation: AutomationRecord = {
      ...automation,
      id: "automation_campaign_daily_one",
      definition: { ...definition, dailySendLimit: 1 },
    };
    const repository = createMemoryRepository([limitedAutomation]);
    await repository.upsertConnection({
      workspaceId: limitedAutomation.workspaceId,
      igUserId: commentEvent.accountId,
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
      status: "CONNECTED",
    });
    const mapping = await repository.findWorkspaceByInstagramAccount(commentEvent.accountId);
    if (!mapping) throw new Error("test connection mapping was not created");
    const client = createClient();
    const options: CampaignRunnerOptions = { client, tokenEncryptionKey: TOKEN_KEY, interactionSecret: INTERACTION_SECRET };

    await processCampaignEvent(commentEvent, limitedAutomation, mapping, repository, options);

    // The one daily slot went to the private reply, not the skipped public reply.
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    const [participant] = await repository.listParticipants(limitedAutomation.workspaceId, limitedAutomation.id, 1);
    expect(participant).toMatchObject({ openingStatus: "SENT", publicReplyStatus: "SKIPPED" });
  });

  it("skips the opening private reply for a comment older than 7 days", async () => {
    const { client, repository, mapping, options } = await createHarness();
    const oldComment = { ...commentEvent, timestamp: NOW - 7 * DAY_MS - 1_000 };

    const result = await processCampaignEvent(oldComment, automation, mapping, repository, options);

    expect(client.sendPrivateReply).not.toHaveBeenCalled();
    expect(result).toMatchObject({ handled: true, sent: 0, skipped: 1, failed: 0 });
    const participant = await readParticipant(repository);
    expect(participant).toMatchObject({
      state: "EXPIRED",
      openingStatus: "SKIPPED",
      openingError: "Instagram only allows a private reply within 7 days of the comment",
    });
    // Meta accepts public replies to older comments, so that one still goes out.
    expect(client.replyToComment).toHaveBeenCalledTimes(1);
    expect(participant.publicReplyStatus).toBe("SENT");
    expect(await repository.getOutboundDelivery(
      deliveryKeys.campaignAction(participant.id, "opening_reply"),
    )).toBeNull();
  });

  it("still sends the opening reply to a comment just inside 7 days", async () => {
    const { client, repository, mapping, options } = await createHarness();
    const recentComment = { ...commentEvent, timestamp: NOW - 7 * DAY_MS + 60_000 };

    await processCampaignEvent(recentComment, automation, mapping, repository, options);

    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(await readParticipant(repository)).toMatchObject({ openingStatus: "SENT" });
  });

  it("uses the participant's age when the comment time is not passed in", async () => {
    const { client, repository, mapping, options } = await createHarness();
    vi.setSystemTime(NOW - 8 * DAY_MS);
    const created = await repository.createParticipant({
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      instagramAccountId: commentEvent.accountId,
      sourceCommentId: "comment_backlog",
      sourceMediaId: sourceSnapshot.id,
      sourceMediaSnapshot: sourceSnapshot,
    });
    vi.setSystemTime(NOW);

    const result = await processExistingCampaignParticipant(created.record, mapping, repository, options, automation);

    expect(client.sendPrivateReply).not.toHaveBeenCalled();
    expect(result).toMatchObject({ skipped: 1 });
    expect(await readParticipant(repository)).toMatchObject({ state: "EXPIRED", openingStatus: "SKIPPED" });
  });
});

describe("campaign sends while Meta limits the account", () => {
  const HOUR = 60 * 60_000;
  const ACCOUNT: SendPauseTarget = { channel: "instagram", accountId: commentEvent.accountId };
  // The plain reasons Activity shows after "Skipped" for a held public reply.
  const PUBLIC_REPLY_THROTTLED = "Instagram asked Linkar to slow down. Public replies are not posted late, to keep the account safe.";
  const PUBLIC_REPLY_RECOVERING = "Linkar is sending slowly while this account recovers from an Instagram limit. Public replies are not posted late, to keep it safe.";
  const PAUSE_ENV_KEYS = ["REDIS_URL", "DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR"] as const;
  const savedEnv = Object.fromEntries(PAUSE_ENV_KEYS.map((key) => [key, process.env[key]]));
  // No public reply, so the opening DM is the comment's only send.
  const dmOnlyAutomation: AutomationRecord = {
    ...automation,
    id: "automation_campaign_dm_only",
    definition: { ...definition, publicReplies: [] },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // No Redis: account pauses live in this process's memory.
    for (const key of PAUSE_ENV_KEYS) delete process.env[key];
    resetAccountPauseStateForTests();
    resetSendRateLimitFallback();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAccountPauseStateForTests();
    for (const key of PAUSE_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  async function harnessFor(record: AutomationRecord) {
    const repository = createMemoryRepository([record]);
    await repository.upsertConnection({
      workspaceId: record.workspaceId,
      igUserId: commentEvent.accountId,
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
      status: "CONNECTED",
    });
    const mapping = await repository.findWorkspaceByInstagramAccount(commentEvent.accountId);
    if (!mapping) throw new Error("test connection mapping was not created");
    const client = createClient();
    const options: CampaignRunnerOptions = { client, tokenEncryptionKey: TOKEN_KEY, interactionSecret: INTERACTION_SECRET };
    return { client, repository, mapping, options };
  }

  /** Opts a non-follower in, then taps "I've followed" again too soon, which asks for the wait notice. */
  async function tooSoonRecheck(harness: Awaited<ReturnType<typeof openParticipant>>): Promise<NormalizedEvent> {
    vi.mocked(harness.client.getUserFollowStatus).mockResolvedValue({ isUserFollowingBusiness: false });
    const optInEvent = interactionEvent(harness.optInPayload, NOW + 1_000);
    vi.setSystemTime(optInEvent.timestamp);
    await processPendingCampaignInteraction(optInEvent, harness.mapping, harness.repository, harness.options);
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
    return interactionEvent(directPostbackPayload(harness.client), optInEvent.timestamp + 5_000, { id: "recheck_too_soon" });
  }

  async function noticeExecution(harness: Awaited<ReturnType<typeof openParticipant>>, event: NormalizedEvent) {
    const participant = await readParticipant(harness.repository);
    return harness.repository.getExecution(automation.workspaceId, `campaign:${participant.id}:cooldown_notice:${event.id}`);
  }

  it("holds a comment's DM through a throttle pause and sends it once after, but skips its public reply", async () => {
    const { client, repository, mapping, options } = await createHarness();
    // Three throttles close together pause the whole account for 15 minutes.
    for (let index = 0; index < 3; index += 1) await recordAccountThrottle(ACCOUNT, { now: NOW });

    const held = await processCampaignEvent(commentEvent, automation, mapping, repository, options)
      .catch((thrown: unknown) => thrown);

    const deferral = findSendDeferral(held);
    expect(deferral?.message).toBe(ACCOUNT_THROTTLED_REASON);
    expect(deferral!.delayMs).toBeGreaterThanOrEqual(15 * 60_000);
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
    expect(client.replyToComment).not.toHaveBeenCalled();
    const participant = await readParticipant(repository);
    // Public replies are skipped, never posted late (see admitPublicReply).
    expect(participant).toMatchObject({
      state: "COMMENT_MATCHED",
      openingStatus: "PENDING",
      publicReplyStatus: "SKIPPED",
      publicReplyError: PUBLIC_REPLY_THROTTLED,
    });
    // The dispatch claims were given back, so the parked job's retry can take the DM's.
    for (const action of ["opening_reply", "public_reply"]) {
      expect(await repository.getExecution(automation.workspaceId, `campaign:${participant.id}:${action}`)).toBeNull();
    }

    vi.setSystemTime(NOW + 16 * 60_000);
    const retried = await processCampaignEvent(commentEvent, automation, mapping, repository, options);

    expect(retried).toMatchObject({ handled: true, sent: 1 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(client.replyToComment).not.toHaveBeenCalled();
    expect(await readParticipant(repository)).toMatchObject({
      state: "OPENING_SENT",
      openingStatus: "SENT",
      publicReplyStatus: "SKIPPED",
    });
  });

  it("sends nothing for a comment parked by a throttle pause after the owner pauses the campaign", async () => {
    const { client, repository, mapping, options } = await createHarness();
    for (let index = 0; index < 3; index += 1) await recordAccountThrottle(ACCOUNT, { now: NOW });
    const held = await processCampaignEvent(commentEvent, automation, mapping, repository, options)
      .catch((thrown: unknown) => thrown);
    expect(findSendDeferral(held)).toBeTruthy();
    const parked = await readParticipant(repository);
    expect(parked).toMatchObject({ state: "COMMENT_MATCHED", openingStatus: "PENDING" });

    await repository.updateAutomation(automation.workspaceId, automation.id, { status: "PAUSED" });
    vi.setSystemTime(NOW + 16 * 60_000);
    const retried = await processCampaignEvent(commentEvent, automation, mapping, repository, options);

    expect(retried).toMatchObject({ handled: true, participantId: parked.id, sent: 0, skipped: 1, failed: 0 });
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
    expect(client.replyToComment).not.toHaveBeenCalled();
    // Not moved on: the hourly sweep expires it.
    expect(await readParticipant(repository)).toMatchObject({ state: "COMMENT_MATCHED", openingStatus: "PENDING" });
  });

  it("counts a throttled media lookup toward the account's cool-down, and retries the comment", async () => {
    const noSnapshot: AutomationRecord = {
      ...automation,
      definition: { ...definition, trigger: { ...definition.trigger, mediaSnapshots: [] } },
    };
    const { client, repository, mapping, options } = await harnessFor(noSnapshot);
    vi.mocked(client.getMedia).mockRejectedValueOnce(await metaThrottleError(80002));
    for (let index = 0; index < 2; index += 1) await recordAccountThrottle(ACCOUNT);

    await expect(processCampaignEvent(commentEvent, noSnapshot, mapping, repository, options))
      .rejects.toMatchObject({ status: 400, code: 80002, retryable: true });

    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "throttled" });
    expect(await repository.listParticipants(automation.workspaceId, automation.id, 10)).toHaveLength(0);
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("counts a throttled next-post media lookup toward the account's cool-down, and retries the comment", async () => {
    const nextPost: AutomationRecord = {
      ...automation,
      definition: {
        ...definition,
        trigger: { type: "comment", source: "next_media", mediaIds: [], mediaSnapshots: [], match: "any", keywords: [] },
      },
    };
    const { client, repository, mapping, options } = await harnessFor(nextPost);
    vi.mocked(client.getMedia).mockRejectedValueOnce(await metaThrottleError(80006));
    for (let index = 0; index < 2; index += 1) await recordAccountThrottle(ACCOUNT);

    await expect(processCampaignEvent(commentEvent, nextPost, mapping, repository, options))
      .rejects.toMatchObject({ status: 400, code: 80006, retryable: true });

    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "throttled" });
    expect((await repository.getAutomation(automation.workspaceId, automation.id))?.boundMediaId).toBeUndefined();
  });

  it("retries an opt-in whose follow check Meta throttles (80002), and sends the link on the retry", async () => {
    const harness = await openParticipant();
    const throttledMeta = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response(JSON.stringify({
        error: { message: "There have been too many calls to this Instagram account. Wait a bit and try again.", code: 80002 },
      }), { status: 400 }),
    });
    vi.mocked(harness.client.getUserFollowStatus)
      .mockImplementationOnce((connection, scopedUserId) => throttledMeta.getUserFollowStatus(connection, scopedUserId))
      .mockResolvedValueOnce({ isUserFollowingBusiness: true });
    const tap = interactionEvent(harness.optInPayload, NOW + 1_000);
    vi.setSystemTime(tap.timestamp);

    const thrown = await processPendingCampaignInteraction(tap, harness.mapping, harness.repository, harness.options)
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(MetaApiError);
    expect(thrown).toMatchObject({ status: 400, code: 80002, retryable: true });
    const afterThrottle = await readParticipant(harness.repository);
    expect(afterThrottle).toMatchObject({ state: "OPTED_IN" });
    expect(afterThrottle.followCheckError).toBeUndefined();
    expect(harness.client.sendDirectMessage).not.toHaveBeenCalled();
    // One throttle is a strike, not a pause, so the retry is not held.
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });

    const retried = await processPendingCampaignInteraction(tap, harness.mapping, harness.repository, harness.options);

    expect(retried).toMatchObject({ handled: true, result: { sent: 1 } });
    expect(await readParticipant(harness.repository)).toMatchObject({ state: "LINK_SENT", finalDeliveryStatus: "SENT" });
    expect(harness.client.getUserFollowStatus).toHaveBeenCalledTimes(2);
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
  });

  it("counts a throttled follow check toward the account's cool-down", async () => {
    const harness = await openParticipant();
    vi.mocked(harness.client.getUserFollowStatus).mockRejectedValueOnce(await metaThrottleError(80002));
    for (let index = 0; index < 2; index += 1) await recordAccountThrottle(ACCOUNT);
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });

    await expect(processPendingCampaignInteraction(
      interactionEvent(harness.optInPayload, NOW + 1_000),
      harness.mapping,
      harness.repository,
      harness.options,
    )).rejects.toMatchObject({ code: 80002 });

    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "throttled" });
  });

  it("skips a public reply Meta throttles, so it never waits on a DM that has already failed for good", async () => {
    const { client, repository, mapping, options } = await createHarness(createClient({
      replyToComment: vi.fn().mockRejectedValue(new MetaApiError("Application request limit reached", 400, true, true, 4)),
      sendPrivateReply: vi.fn().mockRejectedValue(new MetaApiError("Permission missing", 400, true, false, 10)),
    }));

    // Not parked: the DM's failure is final, and nothing is left to retry.
    const result = await processCampaignEvent(commentEvent, automation, mapping, repository, options);

    expect(result).toMatchObject({ handled: true, failed: 1 });
    expect(await readParticipant(repository)).toMatchObject({
      state: "FAILED",
      openingStatus: "FAILED",
      publicReplyStatus: "SKIPPED",
      publicReplyError: PUBLIC_REPLY_THROTTLED,
    });

    // A later delivery of the same comment posts nothing either.
    vi.setSystemTime(NOW + 16 * 60_000);
    await processCampaignEvent(commentEvent, automation, mapping, repository, options);
    expect(client.replyToComment).toHaveBeenCalledTimes(1);
  });

  it("never leaves a public reply pending when it loses the slow restart's share to its DM", async () => {
    // 25% of a 4-an-hour DM ceiling: one automatic send an hour while recovering,
    // which the public reply and the DM compete for.
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "4";
    await recordAccountBlock(ACCOUNT, { now: NOW - 24 * HOUR - 60_000 });
    const { client, repository, mapping, options } = await createHarness(createClient({
      sendPrivateReply: vi.fn().mockRejectedValue(new MetaApiError("Permission missing", 400, true, false, 10)),
    }));

    await processCampaignEvent(commentEvent, automation, mapping, repository, options).catch(() => undefined);
    vi.setSystemTime(NOW + HOUR + 1_000);
    await processCampaignEvent(commentEvent, automation, mapping, repository, options).catch(() => undefined);

    // Whichever send won the slot, the public reply ends posted or skipped,
    // and posted at most once.
    const participant = await readParticipant(repository);
    expect(participant.state).toBe("FAILED");
    expect(["SENT", "SKIPPED"]).toContain(participant.publicReplyStatus);
    if (participant.publicReplyStatus === "SKIPPED") expect(participant.publicReplyError).toBe(PUBLIC_REPLY_RECOVERING);
    expect(vi.mocked(client.replyToComment).mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("skips a public reply over the slow restart's share instead of parking it, and parks the DM", async () => {
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "4";
    await recordAccountBlock(ACCOUNT, { now: NOW - 24 * HOUR - 60_000 });
    // Another send already took this hour's one slot.
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
    const { client, repository, mapping, options } = await createHarness();

    const held = await processCampaignEvent(commentEvent, automation, mapping, repository, options)
      .catch((thrown: unknown) => thrown);

    expect(findSendDeferral(held)?.message).toBe(ACCOUNT_RECOVERING_REASON);
    expect(client.replyToComment).not.toHaveBeenCalled();
    expect(await readParticipant(repository)).toMatchObject({
      openingStatus: "PENDING",
      publicReplyStatus: "SKIPPED",
      publicReplyError: PUBLIC_REPLY_RECOVERING,
    });

    vi.setSystemTime(NOW + HOUR + 1_000);
    await expect(processCampaignEvent(commentEvent, automation, mapping, repository, options))
      .resolves.toMatchObject({ handled: true, sent: 1 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(client.replyToComment).not.toHaveBeenCalled();
  });

  it("waits a minute after Meta throttles a comment's DM, then sends it once", async () => {
    const { client, repository, mapping, options } = await harnessFor(dmOnlyAutomation);
    vi.mocked(client.sendPrivateReply).mockRejectedValueOnce(
      new MetaApiError("Application request limit reached", 400, true, true, 4),
    );

    const held = await processCampaignEvent(commentEvent, dmOnlyAutomation, mapping, repository, options)
      .catch((thrown: unknown) => thrown);

    const deferral = findSendDeferral(held);
    expect(deferral?.message).toBe(ACCOUNT_THROTTLED_REASON);
    expect(deferral!.delayMs).toBeGreaterThanOrEqual(60_000);
    const [waiting] = await repository.listParticipants(dmOnlyAutomation.workspaceId, dmOnlyAutomation.id, 1);
    expect(waiting).toMatchObject({ state: "COMMENT_MATCHED", openingStatus: "PENDING" });

    vi.setSystemTime(NOW + 2 * 60_000 + 1_000);
    const retried = await processCampaignEvent(commentEvent, dmOnlyAutomation, mapping, repository, options);

    expect(retried).toMatchObject({ handled: true, sent: 1 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(2);
    const [sent] = await repository.listParticipants(dmOnlyAutomation.workspaceId, dmOnlyAutomation.id, 1);
    expect(sent).toMatchObject({ state: "OPENING_SENT", openingStatus: "SENT" });
  });

  it("holds a DM over the slow-restart share for a later hour, even on the job's last attempt", async () => {
    // 25% of a 4-an-hour DM ceiling: one automatic send an hour while recovering.
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "4";
    // A block whose 24-hour pause ended a minute ago.
    await recordAccountBlock(ACCOUNT, { now: NOW - 24 * HOUR - 60_000 });
    const { client, repository, mapping, options } = await harnessFor(dmOnlyAutomation);
    const lastAttempt: CampaignRunnerOptions = { ...options, finalAttempt: true };
    const second: NormalizedEvent = { ...commentEvent, id: "comment_2", commentId: "comment_2", recipientId: "commenter_2" };

    const first = await processCampaignEvent(commentEvent, dmOnlyAutomation, mapping, repository, lastAttempt);
    const held = await processCampaignEvent(second, dmOnlyAutomation, mapping, repository, lastAttempt)
      .catch((thrown: unknown) => thrown);

    expect(first).toMatchObject({ handled: true, sent: 1 });
    const deferral = findSendDeferral(held);
    expect(deferral?.message).toBe(ACCOUNT_RECOVERING_REASON);
    // Until the next hour starts (NOW is on the hour), plus up to a minute of jitter.
    expect(deferral!.delayMs).toBeGreaterThanOrEqual(HOUR);
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(await repository.findParticipantBySource(automation.workspaceId, commentEvent.accountId, "comment_2"))
      .toMatchObject({ state: "COMMENT_MATCHED", openingStatus: "PENDING" });

    vi.setSystemTime(NOW + HOUR + 1_000);
    const retried = await processCampaignEvent(second, dmOnlyAutomation, mapping, repository, lastAttempt);

    expect(retried).toMatchObject({ handled: true, sent: 1 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(2);
  });

  it("skips the follow-gate wait notice while the account is cooling down, without calling Meta", async () => {
    const harness = await openParticipant();
    const tooSoon = await tooSoonRecheck(harness);
    for (let index = 0; index < 3; index += 1) await recordAccountThrottle(ACCOUNT);

    await processPendingCampaignInteraction(tooSoon, harness.mapping, harness.repository, harness.options);

    // Only the earlier follow prompt reached Meta.
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(await noticeExecution(harness, tooSoon)).toBeNull();
  });

  it("lets the hourly ceiling hold the wait notice before it takes a slot of the slow restart's share", async () => {
    const harness = await openParticipant();
    const tooSoon = await tooSoonRecheck(harness);
    // 25% of a 4-an-hour DM ceiling: one automatic send an hour while recovering.
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "4";
    await recordAccountBlock(ACCOUNT, { now: Date.now() - 24 * HOUR - 60_000 });
    vi.mocked(checkSendRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterMs: 30 * 60_000 });

    const held = await processPendingCampaignInteraction(tooSoon, harness.mapping, harness.repository, harness.options)
      .catch((thrown: unknown) => thrown);

    expect(findSendDeferral(held)?.message).toBe("Send rate limit reached for this Instagram account");
    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(1);
    // The hour's one slot is still there for the next send.
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
  });

  it("pauses the account when Meta refuses the wait notice with a block", async () => {
    const harness = await openParticipant();
    const tooSoon = await tooSoonRecheck(harness);
    vi.mocked(harness.client.sendDirectMessage).mockRejectedValueOnce(
      new MetaApiError(META_ERROR_REASONS.accountBlocked, 400, true, false, 368),
    );

    await processPendingCampaignInteraction(tooSoon, harness.mapping, harness.repository, harness.options);

    expect(harness.client.sendDirectMessage).toHaveBeenCalledTimes(2);
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "blocked" });
    const notice = await noticeExecution(harness, tooSoon);
    expect(notice).toMatchObject({ status: "FAILED" });
    expect(parseAccountPauseReason(notice?.reason)).toEqual({ platform: "Instagram", durationMs: 24 * HOUR });
  });

  it("counts a throttled wait notice toward the account's cool-down", async () => {
    const harness = await openParticipant();
    const tooSoon = await tooSoonRecheck(harness);
    // Two throttles already; the notice's makes the third.
    for (let index = 0; index < 2; index += 1) await recordAccountThrottle(ACCOUNT);
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
    vi.mocked(harness.client.sendDirectMessage).mockRejectedValueOnce(
      new MetaApiError("Application request limit reached", 400, true, true, 4),
    );

    await processPendingCampaignInteraction(tooSoon, harness.mapping, harness.repository, harness.options);

    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "throttled" });
    expect(await noticeExecution(harness, tooSoon)).toMatchObject({ status: "FAILED", reason: "Meta cooldown notice failed" });
  });
});

describe("campaign kill switch on the comment paths", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resetSendRateLimitFallback();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function pendingParticipant(harness: Awaited<ReturnType<typeof createHarness>>) {
    const created = await harness.repository.createParticipant({
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      instagramAccountId: commentEvent.accountId,
      sourceCommentId: commentEvent.commentId!,
      sourceMediaId: commentEvent.mediaId!,
      sourceMediaSnapshot: sourceSnapshot,
    });
    return created.record;
  }

  it("skips a replayed comment whose campaign is paused, before any public reply or DM", async () => {
    const harness = await createHarness();
    await pendingParticipant(harness);
    await harness.repository.updateAutomation(automation.workspaceId, automation.id, { status: "PAUSED" });

    const result = await processCampaignEvent(commentEvent, automation, harness.mapping, harness.repository, harness.options);

    expect(result).toMatchObject({ handled: true, sent: 0, skipped: 1, failed: 0 });
    expect(harness.client.replyToComment).not.toHaveBeenCalled();
    expect(harness.client.sendPrivateReply).not.toHaveBeenCalled();
    expect(await readParticipant(harness.repository)).toMatchObject({
      state: "COMMENT_MATCHED",
      openingStatus: "PENDING",
      publicReplyStatus: "PENDING",
    });
  });

  it("skips an archived campaign's participant when the comment path asks for a live campaign", async () => {
    const harness = await createHarness();
    const participant = await pendingParticipant(harness);
    const archived = { ...automation, archivedAt: "2026-08-21T09:45:00.000Z" } as AutomationRecord;

    const result = await processExistingCampaignParticipant(
      participant,
      harness.mapping,
      harness.repository,
      { ...harness.options, requireActiveAutomation: true },
      archived,
    );

    expect(result).toMatchObject({ handled: true, skipped: 1 });
    expect(harness.client.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("still sends a live campaign's parked comment on the comment path", async () => {
    const harness = await createHarness();
    await pendingParticipant(harness);

    const result = await processCampaignEvent(commentEvent, automation, harness.mapping, harness.repository, harness.options);

    expect(result).toMatchObject({ handled: true, sent: 1 });
    expect(harness.client.sendPrivateReply).toHaveBeenCalledTimes(1);
  });
});
