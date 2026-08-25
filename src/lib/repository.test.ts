import { afterEach, describe, expect, it, vi } from "vitest";
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

const outboundDeliveryInput = {
  deliveryKey: "automation:automation_1:event:comment_1:action:0",
  workspaceId: "workspace_a",
  kind: "CLASSIC_ACTION" as const,
  recipientId: "scoped_user_1",
  instagramAccountId: "ig_123",
  automationId: "automation_1",
  payload: { text: "Original message" },
};

describe("memory repository", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an owner membership when provisioning a workspace", async () => {
    const repository = createMemoryRepository();

    await repository.ensureWorkspace("workspace_a", "owner@example.com");

    expect(await repository.getMemberRole("workspace_a", "owner@example.com")).toBe("OWNER");
    expect(await repository.listMembers("workspace_a")).toMatchObject([
      { workspaceId: "workspace_a", email: "owner@example.com", role: "OWNER" },
    ]);
  });

  it("lists automations newest-updated first with a deterministic ID tie-breaker", async () => {
    const base = {
      workspaceId: "workspace_a",
      name: "Campaign",
      status: "ACTIVE" as const,
      version: 2,
      priority: 0,
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

  it("allows only the durable dispatch owner to persist provider success", async () => {
    const repository = createMemoryRepository();
    const claim = {
      workspaceId: "workspace_a",
      automationId: "automation_1",
      externalEventId: "comment_1",
      dedupeKey: "campaign:participant_1:opening_reply",
      dispatchOwner: "attempt_owner_a",
      dispatchStartedAt: "2026-08-21T10:00:00.000Z",
      dispatchLeaseExpiresAt: "2026-08-21T10:00:30.000Z",
    };

    expect(await repository.claimExecutionDispatch(claim)).toBe(true);
    expect(await repository.claimExecutionDispatch({ ...claim, dispatchOwner: "attempt_owner_b" })).toBe(false);
    expect(await repository.getExecution(claim.workspaceId, claim.dedupeKey)).toMatchObject({
      status: "PROCESSING",
      dispatchStatus: "DISPATCHING",
      dispatchOwner: "attempt_owner_a",
      dispatchStartedAt: claim.dispatchStartedAt,
      dispatchLeaseExpiresAt: claim.dispatchLeaseExpiresAt,
    });

    expect(await repository.completeOwnedExecution(
      claim.workspaceId,
      claim.dedupeKey,
      "attempt_owner_b",
      { status: "SENT", providerMessageId: "wrong_owner_message" },
    )).toBe(false);
    expect(await repository.failAbandonedExecution(
      claim.workspaceId,
      claim.dedupeKey,
      "2026-08-21T10:00:29.999Z",
      "must remain live",
    )).toBe(false);
    expect(await repository.completeOwnedExecution(claim.workspaceId, claim.dedupeKey, claim.dispatchOwner, {
      status: "SENT",
      providerMessageId: "opening_message_1",
      providerRecipientId: "scoped_user_1",
    })).toBe(true);

    expect(await repository.getExecution(claim.workspaceId, claim.dedupeKey)).toMatchObject({
      status: "SENT",
      dispatchStatus: "DISPATCHING",
      providerMessageId: "opening_message_1",
      providerRecipientId: "scoped_user_1",
    });
  });

  it("rejects reuse of a dispatch owner token across executions", async () => {
    const repository = createMemoryRepository();
    const claim = {
      workspaceId: "workspace_a",
      automationId: "automation_1",
      externalEventId: "comment_1",
      dedupeKey: "campaign:participant_1:opening_reply",
      dispatchOwner: "unique_attempt_owner",
      dispatchStartedAt: "2026-08-21T10:00:00.000Z",
      dispatchLeaseExpiresAt: "2026-08-21T10:00:30.000Z",
    };

    expect(await repository.claimExecutionDispatch(claim)).toBe(true);
    expect(await repository.claimExecutionDispatch({
      ...claim,
      dedupeKey: "campaign:participant_2:opening_reply",
      externalEventId: "comment_2",
    })).toBe(false);
  });

  it("terminally fails an expired dispatch lease and rejects late owner success", async () => {
    const repository = createMemoryRepository();
    const claim = {
      workspaceId: "workspace_a",
      automationId: "automation_1",
      externalEventId: "comment_1",
      dedupeKey: "campaign:participant_1:final_delivery",
      dispatchOwner: "attempt_owner_a",
      dispatchStartedAt: "2026-08-21T10:00:00.000Z",
      dispatchLeaseExpiresAt: "2026-08-21T10:00:30.000Z",
    };
    await repository.claimExecutionDispatch(claim);

    expect(await repository.failAbandonedExecution(
      claim.workspaceId,
      claim.dedupeKey,
      claim.dispatchLeaseExpiresAt,
      "Meta delivery outcome is ambiguous after dispatch lease expiry",
    )).toBe(true);
    expect(await repository.completeOwnedExecution(
      claim.workspaceId,
      claim.dedupeKey,
      claim.dispatchOwner,
      { status: "SENT", providerMessageId: "late_message" },
    )).toBe(false);
    expect(await repository.getExecution(claim.workspaceId, claim.dedupeKey)).toMatchObject({
      status: "FAILED",
      dispatchStatus: "DISPATCHING",
      reason: "Meta delivery outcome is ambiguous after dispatch lease expiry",
    });
  });

  it("terminally fails a historical DISPATCHING execution without durable ownership", async () => {
    const repository = createMemoryRepository();
    const execution = {
      workspaceId: "workspace_a",
      automationId: "automation_1",
      externalEventId: "comment_1",
      dedupeKey: "campaign:participant_1:opening_reply",
    };
    await repository.recordExecution({
      ...execution,
      status: "PROCESSING",
      dispatchStatus: "DISPATCHING",
    });

    expect(await repository.failAbandonedExecution(
      execution.workspaceId,
      execution.dedupeKey,
      "2026-08-21T10:00:00.000Z",
      "Historical dispatch has no valid owner",
    )).toBe(true);
    expect(await repository.getExecution(execution.workspaceId, execution.dedupeKey)).toMatchObject({
      status: "FAILED",
      reason: "Historical dispatch has no valid owner",
    });
  });

  it("allows only the dispatch owner to release a known-not-sent attempt", async () => {
    const repository = createMemoryRepository();
    const claim = {
      workspaceId: "workspace_a",
      automationId: "automation_1",
      externalEventId: "comment_1",
      dedupeKey: "campaign:participant_1:opening_reply",
      dispatchOwner: "attempt_owner_a",
      dispatchStartedAt: "2026-08-21T10:00:00.000Z",
      dispatchLeaseExpiresAt: "2026-08-21T10:00:30.000Z",
    };
    await repository.claimExecutionDispatch(claim);

    expect(await repository.releaseOwnedExecutionClaim(
      claim.workspaceId,
      claim.dedupeKey,
      "attempt_owner_b",
    )).toBe(false);
    expect(await repository.releaseOwnedExecutionClaim(
      claim.workspaceId,
      claim.dedupeKey,
      claim.dispatchOwner,
    )).toBe(true);
    expect(await repository.getExecution(claim.workspaceId, claim.dedupeKey)).toBeNull();
  });

  it("preserves the first outbound payload and permits only one claim owner", async () => {
    const repository = createMemoryRepository();
    const ensured = await repository.ensureOutboundDelivery(outboundDeliveryInput);
    const duplicate = await repository.ensureOutboundDelivery({
      ...outboundDeliveryInput,
      payload: { text: "Edited message" },
    });

    expect(duplicate.id).toBe(ensured.id);
    expect(duplicate.payload).toEqual({ text: "Original message" });

    const lease = "2026-08-23T10:05:00.000Z";
    const [first, second] = await Promise.all([
      repository.claimOutboundDelivery(outboundDeliveryInput.deliveryKey, "worker_a", lease),
      repository.claimOutboundDelivery(outboundDeliveryInput.deliveryKey, "worker_b", lease),
    ]);

    expect([first.claimed, second.claimed].filter(Boolean)).toHaveLength(1);
    expect((first.claimed ? first : second).record).toMatchObject({
      state: "CLAIMED",
      attemptCount: 1,
    });
  });

  it("enforces owner-checked outbound terminal transitions", async () => {
    const repository = createMemoryRepository();
    await repository.ensureOutboundDelivery(outboundDeliveryInput);
    await repository.claimOutboundDelivery(
      outboundDeliveryInput.deliveryKey,
      "worker_a",
      "2026-08-23T10:05:00.000Z",
    );

    expect(await repository.completeOutboundDelivery(
      outboundDeliveryInput.deliveryKey,
      "worker_b",
      "provider_wrong",
      "2026-08-23T10:01:00.000Z",
    )).toBe(false);
    expect(await repository.completeOutboundDelivery(
      outboundDeliveryInput.deliveryKey,
      "worker_a",
      "provider_1",
      "2026-08-23T10:01:00.000Z",
    )).toBe(true);
    await expect(repository.claimOutboundDelivery(
      outboundDeliveryInput.deliveryKey,
      "worker_c",
      "2026-08-23T10:10:00.000Z",
    )).resolves.toMatchObject({ claimed: false, record: { state: "SENT" } });
  });

  it("reclaims only retryable failures and never automatically reclaims UNKNOWN", async () => {
    const repository = createMemoryRepository();
    await repository.ensureOutboundDelivery(outboundDeliveryInput);
    await repository.claimOutboundDelivery(
      outboundDeliveryInput.deliveryKey,
      "worker_a",
      "2026-08-23T10:05:00.000Z",
    );
    expect(await repository.failOutboundDelivery(
      outboundDeliveryInput.deliveryKey,
      "worker_a",
      "Meta throttled the request",
      true,
      "RETRYABLE_REJECTION",
    )).toBe(true);
    await expect(repository.claimOutboundDelivery(
      outboundDeliveryInput.deliveryKey,
      "worker_b",
      "2026-08-23T10:10:00.000Z",
    )).resolves.toMatchObject({ claimed: true, record: { attemptCount: 2 } });

    expect(await repository.markOutboundDeliveryUnknown(
      outboundDeliveryInput.deliveryKey,
      "worker_b",
      "Provider result was ambiguous",
    )).toBe(true);
    await expect(repository.claimOutboundDelivery(
      outboundDeliveryInput.deliveryKey,
      "worker_c",
      "2026-08-23T10:15:00.000Z",
    )).resolves.toMatchObject({ claimed: false, record: { state: "UNKNOWN" } });
  });

  it("lists expired outbound claims without reclaiming them", async () => {
    const repository = createMemoryRepository();
    await repository.ensureOutboundDelivery(outboundDeliveryInput);
    await repository.claimOutboundDelivery(
      outboundDeliveryInput.deliveryKey,
      "worker_a",
      "2026-08-23T10:05:00.000Z",
    );

    expect(await repository.listExpiredDeliveryClaims(
      "2026-08-23T10:05:00.000Z",
      10,
    )).toMatchObject([{ deliveryKey: outboundDeliveryInput.deliveryKey, state: "CLAIMED" }]);
    expect((await repository.getOutboundDelivery(outboundDeliveryInput.deliveryKey))?.state)
      .toBe("CLAIMED");
  });

  it("lists only delivery problems for the requested workspace, newest first", async () => {
    const repository = createMemoryRepository();
    for (const [deliveryKey, workspaceId] of [["failed_a", "workspace_a"], ["failed_b", "workspace_b"]] as const) {
      await repository.ensureOutboundDelivery({ ...outboundDeliveryInput, deliveryKey, workspaceId });
      await repository.claimOutboundDelivery(deliveryKey, "worker", "2026-08-23T10:05:00.000Z");
      await repository.failOutboundDelivery(deliveryKey, "worker", "Meta 429", true, "RETRYABLE_REJECTION");
    }
    await repository.ensureOutboundDelivery({ ...outboundDeliveryInput, deliveryKey: "sent_a" });

    const problems = await repository.listOutboundDeliveryProblems("workspace_a", 100);
    expect(problems.map((problem) => problem.deliveryKey)).toEqual(["failed_a"]);
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

  it("scopes recent participants, media performance, and funnel aggregation to one automation", async () => {
    const repository = createMemoryRepository();
    await repository.createParticipant({
      ...participantInput,
      state: "LINK_SENT",
      openingStatus: "SENT",
      followStatus: true,
      finalDeliveryStatus: "SENT",
      deliveryClickedAt: "2026-08-23T10:00:00.000Z",
    });
    await repository.createParticipant({
      ...participantInput,
      sourceCommentId: "comment_2",
      sourceMediaId: "media_2",
      state: "FOLLOW_REQUIRED",
      openingStatus: "SENT",
      followStatus: false,
    });
    await repository.createParticipant({
      ...participantInput,
      automationId: "automation_2",
      sourceCommentId: "comment_3",
      sourceMediaId: "media_other",
      state: "LINK_SENT",
      openingStatus: "SENT",
      followStatus: true,
      finalDeliveryStatus: "SENT",
    });

    expect((await repository.listRecentParticipants("workspace_a", 10, "automation_1")).map((row) => row.automationId))
      .toEqual(["automation_1", "automation_1"]);
    expect((await repository.countParticipantsByMedia("workspace_a", "automation_1")).map((row) => row.mediaId).sort())
      .toEqual(["media_1", "media_2"]);
    expect(await repository.countParticipantFunnel("workspace_a", "automation_1")).toEqual({
      commented: 2,
      openingSent: 2,
      optedIn: 2,
      followed: 1,
      linkSent: 1,
    });
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

  it("refuses to connect an Instagram account that another workspace owns", async () => {
    const repository = createMemoryRepository();
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_123", username: "creator", accessTokenEncrypted: "token-a", status: "CONNECTED" });

    await expect(repository.upsertConnection({
      workspaceId: "workspace_b",
      igUserId: "ig_123",
      username: "creator",
      accessTokenEncrypted: "token-b",
      status: "CONNECTED",
    })).rejects.toMatchObject({ code: "INSTAGRAM_ACCOUNT_ALREADY_CONNECTED" });
    expect(await repository.listConnections("workspace_b")).toEqual([]);
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

    await repository.beginInstagramDataDeletion("ig_123", "linkar_delete_123", "signed-request-hash");

    expect(await repository.listAutomations("workspace_a")).toEqual([]);
    expect(await repository.listConnections("workspace_a")).toEqual([]);
    expect(await repository.hasExecution("workspace_a", "dedupe_1")).toBe(false);
    expect(await repository.getDataDeletionRequest("linkar_delete_123")).toMatchObject({
      confirmationCode: "linkar_delete_123",
      signedRequestHash: "signed-request-hash",
      status: "PENDING",
    });
    await repository.completeDataDeletion("linkar_delete_123");
    expect(await repository.findDataDeletionByRequestHash("signed-request-hash")).toMatchObject({
      confirmationCode: "linkar_delete_123",
      status: "COMPLETED",
    });
  });

  it("expires non-terminal participants whose messaging window has closed, leaving terminal and still-open ones untouched", async () => {
    const repository = createMemoryRepository();
    const { record: closedWindow } = await repository.createParticipant({
      ...participantInput,
      state: "FOLLOW_REQUIRED",
      messagingWindowExpiresAt: "2026-08-20T00:00:00.000Z",
    });
    const { record: openWindow } = await repository.createParticipant({
      ...participantInput,
      sourceCommentId: "comment_2",
      state: "FOLLOW_REQUIRED",
      messagingWindowExpiresAt: "2026-08-22T00:00:00.000Z",
    });
    const { record: alreadyTerminal } = await repository.createParticipant({
      ...participantInput,
      sourceCommentId: "comment_3",
      state: "LINK_SENT",
      messagingWindowExpiresAt: "2026-08-20T00:00:00.000Z",
    });
    const { record: noWindowSet } = await repository.createParticipant({
      ...participantInput,
      sourceCommentId: "comment_4",
      state: "OPENING_SENT",
    });

    const count = await repository.expireStaleParticipants("2026-08-21T00:00:00.000Z", "Messaging window expired");

    expect(count).toBe(1);
    expect((await repository.getParticipant("workspace_a", "ig_123", closedWindow.id))?.state).toBe("EXPIRED");
    expect((await repository.getParticipant("workspace_a", "ig_123", closedWindow.id))?.finalDeliveryError).toBe("Messaging window expired");
    expect((await repository.getParticipant("workspace_a", "ig_123", openWindow.id))?.state).toBe("FOLLOW_REQUIRED");
    expect((await repository.getParticipant("workspace_a", "ig_123", alreadyTerminal.id))?.state).toBe("LINK_SENT");
    expect((await repository.getParticipant("workspace_a", "ig_123", noWindowSet.id))?.state).toBe("OPENING_SENT");
  });

  it("deletes only terminal participants updated before the cutoff, freeing the source-comment slot", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
      const repository = createMemoryRepository();
      const { record: oldTerminal } = await repository.createParticipant({
        ...participantInput,
        state: "LINK_SENT",
      });
      const { record: stillActive } = await repository.createParticipant({
        ...participantInput,
        sourceCommentId: "comment_3",
        state: "FOLLOW_REQUIRED",
      });

      const cutoff = "2026-08-15T00:00:00.000Z";
      vi.setSystemTime(new Date("2026-08-20T00:00:00.000Z"));
      const { record: recentTerminal } = await repository.createParticipant({
        ...participantInput,
        sourceCommentId: "comment_2",
        state: "EXPIRED",
      });

      const count = await repository.deleteStaleTerminalParticipants(cutoff);

      expect(count).toBe(1);
      expect(await repository.getParticipant("workspace_a", "ig_123", oldTerminal.id)).toBeNull();
      expect(await repository.getParticipant("workspace_a", "ig_123", recentTerminal.id)).toMatchObject({ state: "EXPIRED" });
      expect(await repository.getParticipant("workspace_a", "ig_123", stillActive.id)).toMatchObject({ state: "FOLLOW_REQUIRED" });

      const reCreated = await repository.createParticipant(participantInput);
      expect(reCreated.created).toBe(true);
      expect(reCreated.record.id).not.toBe(oldTerminal.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it("derives broadcast counters from recipient delivery states", async () => {
    const repository = createMemoryRepository();
    const broadcast = await repository.createBroadcast("workspace_a", {
      name: "News",
      text: "Hello",
      segment: "all_contacts",
      total: 4,
    });
    const deliveries = ["sent", "failed", "skipped", "pending"].map((recipient) => ({
      deliveryKey: `broadcast:${broadcast.id}:ig_1:${recipient}`,
      workspaceId: "workspace_a",
      broadcastId: broadcast.id,
      instagramAccountId: "ig_1",
      recipientId: recipient,
      kind: "BROADCAST_RECIPIENT" as const,
      payload: { type: "text", text: "Hello" },
    }));
    for (const delivery of deliveries) await repository.ensureOutboundDelivery(delivery);

    await repository.claimOutboundDelivery(deliveries[0].deliveryKey, "sent_owner", "2026-08-23T10:05:00.000Z");
    await repository.completeOutboundDelivery(deliveries[0].deliveryKey, "sent_owner", "provider_1", "2026-08-23T10:01:00.000Z");
    await repository.claimOutboundDelivery(deliveries[1].deliveryKey, "failed_owner", "2026-08-23T10:05:00.000Z");
    await repository.failOutboundDelivery(deliveries[1].deliveryKey, "failed_owner", "rejected", false, "PROVIDER_REJECTED");
    await repository.claimOutboundDelivery(deliveries[2].deliveryKey, "skipped_owner", "2026-08-23T10:05:00.000Z");
    await repository.failOutboundDelivery(deliveries[2].deliveryKey, "skipped_owner", "suppressed", false, "SUPPRESSED");

    await expect(repository.reconcileBroadcastCounters("workspace_a", broadcast.id))
      .resolves.toEqual({ total: 4, sent: 1, failed: 1, skipped: 1, pending: 1 });
    expect(await repository.getBroadcast("workspace_a", broadcast.id)).toMatchObject({
      status: "RUNNING",
      total: 4,
      sent: 1,
      failed: 1,
      skipped: 1,
    });
  });
});
