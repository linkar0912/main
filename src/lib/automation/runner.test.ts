import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { FlowDefinition, FlowDefinitionV2, NormalizedEvent } from "./types";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { processNormalizedEvent, type AutomationRunnerClient } from "./runner";
import { MetaApiError } from "../meta/client";

const flow: FlowDefinition = {
  version: 1,
  trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply", text: "Here is the guide" }],
};

const event: NormalizedEvent = {
  id: "comment_1",
  accountId: "ig_1",
  type: "comment.created",
  text: "guide",
  commentId: "comment_1",
  recipientId: "person_1",
  timestamp: 1,
};

const campaignDefinition: FlowDefinitionV2 = {
  version: 2,
  trigger: {
    type: "comment",
    source: "specific_media",
    mediaIds: ["media_1"],
    mediaSnapshots: [{
      id: "media_1",
      mediaType: "VIDEO",
      mediaProductType: "REELS",
      permalink: "https://www.instagram.com/reel/media_1",
      timestamp: "2026-08-21T09:00:00.000Z",
    }],
    match: "keyword",
    keywords: ["guide"],
  },
  publicReplies: [],
  openingMessage: { text: "Want the guide?", optInButtonLabel: "Get guide" },
  followGate: { required: true, notFollowingMessage: "Follow first", recheckButtonLabel: "I've followed" },
  delivery: { text: "Here is the guide", url: "https://example.com/protected" },
};

function createRunnerClient(overrides: Partial<AutomationRunnerClient> = {}): AutomationRunnerClient {
  return {
    sendPrivateReply: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "opening_1" }),
    sendDirectMessage: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "direct_1" }),
    replyToComment: vi.fn().mockResolvedValue({ id: "public_1" }),
    sendQuickReply: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "prompt_1" }),
    getUserFollowStatus: vi.fn().mockResolvedValue({ isUserFollowingBusiness: true }),
    getMedia: vi.fn().mockResolvedValue({
      id: "media_1",
      mediaType: "VIDEO",
      mediaProductType: "REELS",
      permalink: "https://www.instagram.com/reel/media_1",
      timestamp: "2026-08-21T09:00:00.000Z",
    }),
    ...overrides,
  };
}

describe("automation runner", () => {
  it("delivers a matching action and deduplicates the webhook event", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([
      {
        id: "automation_1",
        workspaceId: "workspace_a",
        name: "Guide delivery",
        status: "ACTIVE",
        version: 1,
        definition: flow,
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      },
    ]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    const client = createRunnerClient({
      sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "message_1" }),
    });

    const first = await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key });
    const second = await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key });

    expect(first).toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(second).toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      "Here is the guide",
    );
  });

  it("leaves retryable Meta failures unrecorded so the queue can retry", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([{ id: "automation_retry", workspaceId: "workspace_a", name: "Retry delivery", status: "ACTIVE", version: 1, definition: flow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() }]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({
      sendPrivateReply: vi.fn()
        .mockRejectedValueOnce(new MetaApiError("rate limited", 429))
        .mockResolvedValueOnce({ message_id: "message_retry" }),
    });

    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key })).rejects.toThrow("rate limited");
    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key })).resolves.toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(2);
  });

  it("records a retryable delivery failure only on the final queue attempt", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([{ id: "automation_final", workspaceId: "workspace_a", name: "Final attempt", status: "ACTIVE", version: 1, definition: flow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() }]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({ sendPrivateReply: vi.fn().mockRejectedValue(new MetaApiError("temporarily unavailable", 503)) });

    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key, finalAttempt: true })).resolves.toEqual({ matched: 1, sent: 0, skipped: 0, failed: 1 });
    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key, finalAttempt: true })).resolves.toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
  });

  it("runs only the newest matching version 2 campaign and consumes the comment before version 1", async () => {
    const key = randomBytes(32).toString("hex");
    const olderCampaign = {
      id: "campaign_older",
      workspaceId: "workspace_a",
      name: "Older campaign",
      status: "ACTIVE" as const,
      version: 2,
      definition: campaignDefinition,
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T09:00:00.000Z",
    };
    const newerCampaign = {
      ...olderCampaign,
      id: "campaign_newer",
      name: "Newer campaign",
      updatedAt: "2026-08-21T10:00:00.000Z",
    };
    const legacy = {
      id: "legacy_overlap",
      workspaceId: "workspace_a",
      name: "Legacy overlap",
      status: "ACTIVE" as const,
      version: 1,
      definition: flow,
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T11:00:00.000Z",
    };
    const repository = createMemoryRepository([olderCampaign, newerCampaign, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient();
    const campaignEvent = { ...event, mediaId: "media_1", timestamp: Date.parse("2026-08-21T10:01:00.000Z") };

    const result = await processNormalizedEvent(campaignEvent, repository, {
      client,
      tokenEncryptionKey: key,
      interactionSecret: "app-secret",
      campaignsEnabled: true,
    });

    expect(result).toMatchObject({ handled: true, matched: 1, sent: 1 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(await repository.listParticipants("workspace_a", "campaign_newer", 10)).toHaveLength(1);
    expect(await repository.listParticipants("workspace_a", "campaign_older", 10)).toHaveLength(0);
    expect(await repository.hasExecution("workspace_a", "legacy_overlap:comment_1")).toBe(false);
  });

  it("resumes the source-comment uniqueness winner with its original campaign definition", async () => {
    const key = randomBytes(32).toString("hex");
    const originalDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      openingMessage: { ...campaignDefinition.openingMessage, text: "Original opening" },
    };
    const updatedDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      openingMessage: { ...campaignDefinition.openingMessage, text: "Newer campaign opening" },
    };
    const original = { id: "campaign_original", workspaceId: "workspace_a", name: "Original", status: "ACTIVE" as const, version: 2, definition: originalDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() };
    const newer = { id: "campaign_newer_retry", workspaceId: "workspace_a", name: "Newer", status: "ACTIVE" as const, version: 2, definition: updatedDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const repository = createMemoryRepository([original, newer]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    await repository.createParticipant({
      workspaceId: "workspace_a",
      automationId: original.id,
      instagramAccountId: "ig_1",
      sourceCommentId: "comment_1",
      sourceMediaId: "media_1",
      sourceMediaSnapshot: campaignDefinition.trigger.mediaSnapshots[0]!,
      publicReplyStatus: "SENT",
      publicReplyProviderId: "public_original",
    });
    const client = createRunnerClient();

    const result = await processNormalizedEvent({ ...event, mediaId: "media_1" }, repository, {
      client,
      tokenEncryptionKey: key,
      interactionSecret: "app-secret",
      campaignsEnabled: true,
    });

    expect(result).toMatchObject({ handled: true, sent: 1 });
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      expect.objectContaining({ text: "Original opening" }),
    );
    expect(await repository.listParticipants("workspace_a", original.id, 10)).toHaveLength(1);
    expect(await repository.listParticipants("workspace_a", newer.id, 10)).toHaveLength(0);
  });

  it("recovers an existing source winner before V1 after its V2 campaign is paused and edited", async () => {
    const key = randomBytes(32).toString("hex");
    const editedDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      trigger: {
        ...campaignDefinition.trigger,
        mediaIds: ["media_other"],
        mediaSnapshots: [{ ...campaignDefinition.trigger.mediaSnapshots[0]!, id: "media_other" }],
      },
      openingMessage: { ...campaignDefinition.openingMessage, text: "Recovered source winner" },
    };
    const original = {
      id: "campaign_paused_source",
      workspaceId: "workspace_a",
      name: "Paused original",
      status: "PAUSED" as const,
      version: 2,
      definition: editedDefinition,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(3).toISOString(),
    };
    const legacy = {
      id: "legacy_source_replay",
      workspaceId: "workspace_a",
      name: "Legacy overlap",
      status: "ACTIVE" as const,
      version: 1,
      definition: flow,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(2).toISOString(),
    };
    const repository = createMemoryRepository([original, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    await repository.createParticipant({
      workspaceId: "workspace_a",
      automationId: original.id,
      instagramAccountId: "ig_1",
      sourceCommentId: "comment_1",
      sourceMediaId: "media_1",
      sourceMediaSnapshot: campaignDefinition.trigger.mediaSnapshots[0]!,
      publicReplyStatus: "SENT",
      publicReplyProviderId: "public_original",
    });
    const client = createRunnerClient();

    const result = await processNormalizedEvent({ ...event, mediaId: "media_1" }, repository, {
      client,
      tokenEncryptionKey: key,
      interactionSecret: "app-secret",
      campaignsEnabled: true,
    });

    expect(result).toMatchObject({ handled: true, sent: 1 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      expect.objectContaining({ text: "Recovered source winner" }),
    );
    expect(await repository.hasExecution("workspace_a", "legacy_source_replay:comment_1")).toBe(false);
  });

  it("falls back to version 1 unchanged when no enabled version 2 campaign matches", async () => {
    const key = randomBytes(32).toString("hex");
    const nonMatchingCampaign = {
      id: "campaign_nonmatch",
      workspaceId: "workspace_a",
      name: "Different media",
      status: "ACTIVE" as const,
      version: 2,
      definition: {
        ...campaignDefinition,
        trigger: {
          ...campaignDefinition.trigger,
          mediaIds: ["media_other"],
          mediaSnapshots: [{ ...campaignDefinition.trigger.mediaSnapshots[0], id: "media_other" }],
        },
      },
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    };
    const legacy = { id: "legacy_fallback", workspaceId: "workspace_a", name: "Legacy", status: "ACTIVE" as const, version: 1, definition: flow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() };
    const repository = createMemoryRepository([nonMatchingCampaign, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({ sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "legacy_message" }) });

    await expect(processNormalizedEvent({ ...event, mediaId: "media_1" }, repository, {
      client,
      tokenEncryptionKey: key,
      interactionSecret: "app-secret",
      campaignsEnabled: true,
    })).resolves.toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      "Here is the guide",
    );
  });

  it("keeps version 2 disabled by default while version 1 remains operational", async () => {
    const key = randomBytes(32).toString("hex");
    const campaign = { id: "campaign_disabled", workspaceId: "workspace_a", name: "Disabled campaign", status: "ACTIVE" as const, version: 2, definition: campaignDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const legacy = { id: "legacy_enabled", workspaceId: "workspace_a", name: "Legacy", status: "ACTIVE" as const, version: 1, definition: flow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() };
    const repository = createMemoryRepository([campaign, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({ sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "legacy_message" }) });

    await processNormalizedEvent({ ...event, mediaId: "media_1" }, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret" });

    expect(await repository.listParticipants("workspace_a", "campaign_disabled", 10)).toHaveLength(0);
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      "Here is the guide",
    );
  });

  it("fails a matched version 2 campaign visibly when the interaction secret is absent", async () => {
    const key = randomBytes(32).toString("hex");
    const campaign = { id: "campaign_no_secret", workspaceId: "workspace_a", name: "No secret", status: "ACTIVE" as const, version: 2, definition: campaignDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const repository = createMemoryRepository([campaign]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient();

    const result = await processNormalizedEvent({ ...event, mediaId: "media_1" }, repository, {
      client,
      tokenEncryptionKey: key,
      campaignsEnabled: true,
    });

    expect(result).toMatchObject({ handled: true, matched: 1, sent: 0, failed: 1 });
    expect(client.replyToComment).not.toHaveBeenCalled();
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("does not bind next-media campaigns to media published at or before activation", async () => {
    const key = randomBytes(32).toString("hex");
    const nextDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      trigger: { ...campaignDefinition.trigger, source: "next_media", mediaIds: [], mediaSnapshots: [] },
    };
    const campaign = { id: "campaign_next", workspaceId: "workspace_a", name: "Next Reel", status: "ACTIVE" as const, version: 2, definition: nextDefinition, activatedAt: "2026-08-21T10:00:00.000Z", createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const repository = createMemoryRepository([campaign]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({ getMedia: vi.fn().mockResolvedValue({ id: "media_old", mediaType: "VIDEO", mediaProductType: "REELS", permalink: "https://www.instagram.com/reel/media_old", timestamp: "2026-08-21T11:00:00.000+02:00" }) });

    const result = await processNormalizedEvent({ ...event, mediaId: "media_old" }, repository, {
      client,
      tokenEncryptionKey: key,
      interactionSecret: "app-secret",
      campaignsEnabled: true,
    });

    expect(result).toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
    expect((await repository.getAutomation("workspace_a", campaign.id))?.boundMediaId).toBeUndefined();
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("does not bind next-media when publication is exactly equal to activation", async () => {
    const key = randomBytes(32).toString("hex");
    const nextDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      trigger: { ...campaignDefinition.trigger, source: "next_media", mediaIds: [], mediaSnapshots: [] },
    };
    const campaign = { id: "campaign_next_equal", workspaceId: "workspace_a", name: "Next Reel equality", status: "ACTIVE" as const, version: 2, definition: nextDefinition, activatedAt: "2026-08-21T10:00:00.000Z", createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const repository = createMemoryRepository([campaign]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({
      getMedia: vi.fn().mockResolvedValue({ id: "media_equal", mediaType: "VIDEO", mediaProductType: "REELS", permalink: "https://www.instagram.com/reel/media_equal", timestamp: campaign.activatedAt }),
    });

    await expect(processNormalizedEvent({ ...event, mediaId: "media_equal" }, repository, {
      client,
      tokenEncryptionKey: key,
      interactionSecret: "app-secret",
      campaignsEnabled: true,
    })).resolves.toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
    expect((await repository.getAutomation("workspace_a", campaign.id))?.boundMediaId).toBeUndefined();
    expect(client.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("atomically binds one competing post-activation media event and only that event continues", async () => {
    const key = randomBytes(32).toString("hex");
    const nextDefinition: FlowDefinitionV2 = {
      ...campaignDefinition,
      trigger: { ...campaignDefinition.trigger, source: "next_media", mediaIds: [], mediaSnapshots: [] },
    };
    const campaign = { id: "campaign_next_race", workspaceId: "workspace_a", name: "Next Reel", status: "ACTIVE" as const, version: 2, definition: nextDefinition, activatedAt: "2026-08-21T10:00:00.000Z", createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const repository = createMemoryRepository([campaign]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({
      getMedia: vi.fn().mockImplementation(async (_connection, mediaId: string) => ({
        id: mediaId,
        mediaType: "VIDEO" as const,
        mediaProductType: "REELS" as const,
        permalink: `https://www.instagram.com/reel/${mediaId}`,
        timestamp: "2026-08-21T10:00:00.001Z",
      })),
    });
    const first = { ...event, id: "comment_next_1", commentId: "comment_next_1", mediaId: "media_next_1" };
    const second = { ...event, id: "comment_next_2", commentId: "comment_next_2", mediaId: "media_next_2" };

    await Promise.all([
      processNormalizedEvent(first, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true }),
      processNormalizedEvent(second, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true }),
    ]);

    const boundMediaId = (await repository.getAutomation("workspace_a", campaign.id))?.boundMediaId;
    expect(["media_next_1", "media_next_2"]).toContain(boundMediaId);
    const participants = await repository.listParticipants("workspace_a", campaign.id, 10);
    expect(participants).toHaveLength(1);
    expect(participants[0]?.sourceMediaId).toBe(boundMediaId);
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it("handles signed campaign interactions before generic version 1 postback rules", async () => {
    const key = randomBytes(32).toString("hex");
    const campaign = { id: "campaign_interaction", workspaceId: "workspace_a", name: "Campaign", status: "ACTIVE" as const, version: 2, definition: campaignDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const messageFlow: FlowDefinition = {
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Legacy postback response" }],
    };
    const legacy = { id: "legacy_postback", workspaceId: "workspace_a", name: "Legacy", status: "ACTIVE" as const, version: 1, definition: messageFlow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() };
    const repository = createMemoryRepository([campaign, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient({ getUserFollowStatus: vi.fn().mockResolvedValue({ isUserFollowingBusiness: false }) });
    await processNormalizedEvent({ ...event, mediaId: "media_1", timestamp: Date.now() }, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true });
    const opening = vi.mocked(client.sendPrivateReply).mock.calls[0]?.[2];
    if (typeof opening === "string" || !opening?.quickReply) throw new Error("opening payload missing");

    await processNormalizedEvent({
      id: "postback_1",
      accountId: "ig_1",
      type: "postback.received",
      text: "legacy would match",
      recipientId: "person_1",
      interactionPayload: opening.quickReply.payload,
      timestamp: Date.now() + 1_000,
    }, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true });

    expect(client.sendQuickReply).toHaveBeenCalledTimes(1);
    expect(client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await repository.hasExecution("workspace_a", "legacy_postback:postback_1")).toBe(false);
  });

  it("consumes a tampered campaign interaction before generic V1 message handling", async () => {
    const key = randomBytes(32).toString("hex");
    const campaign = { id: "campaign_invalid_interaction", workspaceId: "workspace_a", name: "Campaign", status: "ACTIVE" as const, version: 2, definition: campaignDefinition, createdAt: new Date(1).toISOString(), updatedAt: new Date(2).toISOString() };
    const messageFlow: FlowDefinition = {
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Legacy must not run" }],
    };
    const legacy = { id: "legacy_invalid_campaign_payload", workspaceId: "workspace_a", name: "Legacy", status: "ACTIVE" as const, version: 1, definition: messageFlow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() };
    const repository = createMemoryRepository([campaign, legacy]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = createRunnerClient();
    await processNormalizedEvent({ ...event, mediaId: "media_1", timestamp: Date.now() }, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true });
    const opening = vi.mocked(client.sendPrivateReply).mock.calls[0]?.[2];
    if (typeof opening === "string" || !opening?.quickReply) throw new Error("opening payload missing");

    const result = await processNormalizedEvent({
      id: "postback_tampered",
      accountId: "ig_1",
      type: "postback.received",
      text: "legacy would match",
      recipientId: "person_1",
      interactionPayload: `${opening.quickReply.payload}tampered`,
      timestamp: Date.now() + 1_000,
    }, repository, { client, tokenEncryptionKey: key, interactionSecret: "app-secret", campaignsEnabled: true });

    expect(result).toMatchObject({ handled: true, failed: 1 });
    expect(client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await repository.hasExecution("workspace_a", "legacy_invalid_campaign_payload:postback_tampered")).toBe(false);
  });
});
