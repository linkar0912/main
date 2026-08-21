import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";

const definition = {
  version: 1 as const,
  trigger: { type: "comment" as const, match: "keyword" as const, keywords: ["guide"], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply" as const, text: "Here you go" }],
};

const campaignDefinition = {
  version: 2 as const,
  trigger: {
    type: "comment" as const,
    source: "next_media" as const,
    mediaIds: [],
    mediaSnapshots: [],
    match: "keyword" as const,
    keywords: ["guide"],
  },
  publicReplies: [],
  openingMessage: { text: "Thanks for your comment", optInButtonLabel: "Get the guide" },
  followGate: { required: true as const, notFollowingMessage: "Follow us first", recheckButtonLabel: "I've followed" },
  delivery: { text: "Here is your guide", url: "https://example.com/guide" },
};

const participantInput = {
  workspaceId: "workspace_a",
  automationId: "automation_1",
  instagramAccountId: "ig_123",
  sourceCommentId: "comment_1",
  sourceMediaId: "media_1",
  sourceMediaSnapshot: {
    id: "media_1",
    mediaType: "VIDEO" as const,
    mediaProductType: "REELS" as const,
    permalink: "https://instagram.com/reel/media_1",
    timestamp: "2026-08-21T09:00:00.000Z",
  },
  matchedKeyword: "guide",
};

describe("memory repository", () => {
  it("lists automations newest-updated first with a deterministic ID tie-breaker", async () => {
    const base = {
      workspaceId: "workspace_a",
      name: "Campaign",
      status: "ACTIVE" as const,
      version: 2,
      definition,
      createdAt: "2026-08-21T08:00:00.000Z",
    };
    const repository = createMemoryRepository([
      { ...base, id: "campaign_b", updatedAt: "2026-08-21T10:00:00.000Z" },
      { ...base, id: "campaign_old", updatedAt: "2026-08-21T09:00:00.000Z" },
      { ...base, id: "campaign_a", updatedAt: "2026-08-21T10:00:00.000Z" },
    ]);

    expect((await repository.listAutomations("workspace_a")).map((item) => item.id)).toEqual([
      "campaign_a",
      "campaign_b",
      "campaign_old",
    ]);
  });

  it("creates, lists, and updates automations within a workspace", async () => {
    const repository = createMemoryRepository();
    const created = await repository.createAutomation("workspace_a", {
      name: "Guide delivery",
      definition,
    });

    expect(created.status).toBe("DRAFT");
    expect((await repository.listAutomations("workspace_a"))).toHaveLength(1);
    expect((await repository.listAutomations("workspace_b"))).toHaveLength(0);

    const updated = await repository.updateAutomation("workspace_a", created.id, { status: "ACTIVE" });
    expect(updated?.status).toBe("ACTIVE");
    expect(await repository.updateAutomation("workspace_b", created.id, { status: "PAUSED" })).toBeNull();
  });

  it("rejects a duplicate execution dedupe key", async () => {
    const repository = createMemoryRepository();
    const first = await repository.recordExecution({
      workspaceId: "workspace_a",
      automationId: "automation_1",
      externalEventId: "comment_1",
      dedupeKey: "automation_1:comment_1",
      status: "SENT",
      reason: "demo",
    });
    const second = await repository.recordExecution({
      workspaceId: "workspace_a",
      automationId: "automation_1",
      externalEventId: "comment_1",
      dedupeKey: "automation_1:comment_1",
      status: "SENT",
      reason: "duplicate",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it("atomically claims a delivery once", async () => {
    const repository = createMemoryRepository();
    const claim = { workspaceId: "workspace_a", automationId: "automation_1", externalEventId: "comment_1", dedupeKey: "automation_1:comment_1" };
    expect(await repository.claimExecution(claim)).toBe(true);
    expect(await repository.claimExecution(claim)).toBe(false);
  });

  it("persists the provider dispatch phase and identifiers for action reconciliation", async () => {
    const repository = createMemoryRepository();
    const claim = {
      workspaceId: "workspace_a",
      automationId: "automation_1",
      externalEventId: "comment_1",
      dedupeKey: "campaign:participant_1:opening_reply",
    };

    expect(await repository.claimExecution(claim)).toBe(true);
    const claimed = await repository.getExecution(claim.workspaceId, claim.dedupeKey);
    expect(claimed).toMatchObject({
      status: "PROCESSING",
      dispatchStatus: "CLAIMED",
    });
    expect(claimed?.providerMessageId).toBeUndefined();
    expect(claimed?.providerRecipientId).toBeUndefined();
    expect(await repository.markExecutionDispatching(claim.workspaceId, claim.dedupeKey)).toBe(true);
    expect(await repository.markExecutionDispatching(claim.workspaceId, claim.dedupeKey)).toBe(false);
    expect(await repository.getExecution(claim.workspaceId, claim.dedupeKey)).toMatchObject({
      status: "PROCESSING",
      dispatchStatus: "DISPATCHING",
    });

    await repository.completeExecution(claim.workspaceId, claim.dedupeKey, {
      status: "SENT",
      providerMessageId: "opening_message_1",
      providerRecipientId: "scoped_user_1",
    });

    expect(await repository.getExecution(claim.workspaceId, claim.dedupeKey)).toMatchObject({
      status: "SENT",
      dispatchStatus: "DISPATCHING",
      providerMessageId: "opening_message_1",
      providerRecipientId: "scoped_user_1",
    });
    expect(await repository.markExecutionDispatching(claim.workspaceId, claim.dedupeKey)).toBe(false);
  });

  it("deduplicates a source comment across matching automations", async () => {
    const repository = createMemoryRepository();
    const first = await repository.createParticipant(participantInput);
    const duplicate = await repository.createParticipant(participantInput);
    const otherAutomation = await repository.createParticipant({ ...participantInput, automationId: "automation_2" });

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(otherAutomation.created).toBe(false);
    expect(duplicate.record.id).toBe(first.record.id);
    expect(otherAutomation.record.id).toBe(first.record.id);
  });

  it("looks up the exact participant by scoped identity or source comment", async () => {
    const repository = createMemoryRepository();
    const { record } = await repository.createParticipant({
      ...participantInput,
      igScopedUserId: "scoped_user_1",
    });

    expect(await repository.getParticipant("workspace_a", "ig_123", record.id)).toMatchObject({
      id: record.id,
      sourceCommentId: "comment_1",
    });
    expect(await repository.getParticipant("workspace_b", "ig_123", record.id)).toBeNull();
    expect(await repository.getParticipant("workspace_a", "ig_other", record.id)).toBeNull();
    expect(await repository.findParticipantBySource("workspace_a", "ig_123", "comment_1")).toMatchObject({
      id: record.id,
      automationId: "automation_1",
    });
    expect(await repository.findParticipantBySource("workspace_a", "ig_123", "comment_missing")).toBeNull();
  });

  it("claims participant state transitions once and prevents duplicate final delivery", async () => {
    const repository = createMemoryRepository();
    const { record } = await repository.createParticipant(participantInput);
    const checkedAt = "2026-08-21T10:00:00.000Z";

    expect(await repository.transitionParticipant(record.id, ["OPTED_IN"], {
      state: "FOLLOW_VERIFIED",
      followStatus: true,
      followCheckedAt: checkedAt,
    })).toBeNull();
    expect(await repository.transitionParticipant(record.id, ["COMMENT_MATCHED"], {
      state: "OPTED_IN",
      igScopedUserId: "scoped_user_1",
    })).toMatchObject({ state: "OPTED_IN", igScopedUserId: "scoped_user_1" });
    expect(await repository.transitionParticipant(record.id, ["OPTED_IN"], {
      state: "FOLLOW_VERIFIED",
      followStatus: true,
      followCheckedAt: checkedAt,
    })).toMatchObject({ state: "FOLLOW_VERIFIED", followStatus: true, followCheckedAt: checkedAt });

    const [firstDelivery, duplicateDelivery] = await Promise.all([
      repository.transitionParticipant(record.id, ["FOLLOW_VERIFIED"], {
        state: "LINK_SENT",
        finalDeliveryStatus: "SENT",
        finalProviderId: "final_1",
        finalDeliveredAt: checkedAt,
      }),
      repository.transitionParticipant(record.id, ["FOLLOW_VERIFIED"], {
        state: "LINK_SENT",
        finalDeliveryStatus: "SENT",
        finalProviderId: "final_2",
        finalDeliveredAt: checkedAt,
      }),
    ]);

    expect([firstDelivery, duplicateDelivery].filter(Boolean)).toHaveLength(1);
    expect((firstDelivery ?? duplicateDelivery)?.finalDeliveryStatus).toBe("SENT");
  });

  it("finds pending participants by Instagram-scoped user id", async () => {
    const repository = createMemoryRepository();
    const { record } = await repository.createParticipant(participantInput);
    await repository.transitionParticipant(record.id, ["COMMENT_MATCHED"], {
      state: "OPTED_IN",
      igScopedUserId: "scoped_user_1",
    });

    expect(await repository.findPendingParticipant("ig_123", "scoped_user_1")).toMatchObject({ id: record.id, state: "OPTED_IN" });
    expect(await repository.findPendingParticipant("ig_123", "scoped_user_missing")).toBeNull();

    await repository.transitionParticipant(record.id, ["OPTED_IN"], { state: "EXPIRED" });
    expect(await repository.findPendingParticipant("ig_123", "scoped_user_1")).toBeNull();
  });

  it("lists only the requested workspace automation participants", async () => {
    const repository = createMemoryRepository();
    const first = await repository.createParticipant(participantInput);
    await repository.createParticipant({ ...participantInput, sourceCommentId: "comment_2" });
    await repository.createParticipant({ ...participantInput, workspaceId: "workspace_b", sourceCommentId: "comment_3" });
    await repository.createParticipant({ ...participantInput, automationId: "automation_2", sourceCommentId: "comment_4" });

    const participants = await repository.listParticipants("workspace_a", "automation_1", 10);
    expect(participants).toHaveLength(2);
    expect(participants.map((participant) => participant.id)).toContain(first.record.id);
    expect(participants.every((participant) => participant.workspaceId === "workspace_a" && participant.automationId === "automation_1")).toBe(true);
  });

  it("binds exactly one post published after next-media activation", async () => {
    const repository = createMemoryRepository();
    const automation = await repository.createAutomation("workspace_a", { name: "Next Reel", definition: campaignDefinition });
    const activatedAt = "2026-08-21T10:00:00.000Z";
    const activated = await repository.updateAutomation("workspace_a", automation.id, { status: "ACTIVE", activatedAt });

    expect(activated).toMatchObject({ version: 2, activatedAt });
    expect(await repository.bindNextMedia("workspace_a", automation.id, "media_old", activatedAt)).toBe(false);
    const winners = await Promise.all([
      repository.bindNextMedia("workspace_a", automation.id, "media_2", "2026-08-21T10:00:00.001Z"),
      repository.bindNextMedia("workspace_a", automation.id, "media_3", "2026-08-21T10:00:00.001Z"),
    ]);

    expect(winners.filter(Boolean)).toHaveLength(1);
    expect((await repository.getAutomation("workspace_a", automation.id))?.boundMediaId).toMatch(/^media_[23]$/);
  });

  it("finds a workspace connection by Instagram account id", async () => {
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_123",
      username: "creator",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });

    expect((await repository.findWorkspaceByInstagramAccount("ig_123"))?.workspaceId).toBe("workspace_a");
    expect(await repository.findWorkspaceByInstagramAccount("ig_missing")).toBeNull();

    await repository.deleteConnectionByInstagramAccount("ig_123");
    expect(await repository.findWorkspaceByInstagramAccount("ig_123")).toBeNull();
  });

  it("disconnects only the selected connection in the authorized workspace", async () => {
    const repository = createMemoryRepository();
    const first = await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "one", accessTokenEncrypted: "token-one", status: "CONNECTED" });
    await repository.upsertConnection({ workspaceId: "workspace_b", igUserId: "ig_2", username: "two", accessTokenEncrypted: "token-two", status: "CONNECTED" });

    expect(await repository.deleteConnection("workspace_b", first.id)).toBe(false);
    expect(await repository.deleteConnection("workspace_a", first.id)).toBe(true);
    expect(await repository.listConnections("workspace_a")).toEqual([]);
    expect(await repository.listConnections("workspace_b")).toHaveLength(1);
  });

  it("deletes Instagram-derived workspace data and persists a confirmation status", async () => {
    const repository = createMemoryRepository();
    const automation = await repository.createAutomation("workspace_a", { name: "Guide delivery", definition });
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_123", username: "creator", accessTokenEncrypted: "sealed-token", status: "CONNECTED" });
    await repository.recordExecution({ workspaceId: "workspace_a", automationId: automation.id, externalEventId: "comment_1", dedupeKey: "dedupe_1", status: "SENT" });

    await repository.beginInstagramDataDeletion("ig_123", "replyconnect_delete_123", "signed-request-hash");

    expect(await repository.listAutomations("workspace_a")).toEqual([]);
    expect(await repository.listConnections("workspace_a")).toEqual([]);
    expect(await repository.hasExecution("workspace_a", "dedupe_1")).toBe(false);
    expect(await repository.getDataDeletionRequest("replyconnect_delete_123")).toMatchObject({
      confirmationCode: "replyconnect_delete_123",
      signedRequestHash: "signed-request-hash",
      status: "PENDING",
    });
    await repository.completeDataDeletion("replyconnect_delete_123");
    expect(await repository.findDataDeletionByRequestHash("signed-request-hash")).toMatchObject({
      confirmationCode: "replyconnect_delete_123",
      status: "COMPLETED",
    });
  });
});
