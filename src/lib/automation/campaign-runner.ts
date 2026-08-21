import { randomUUID } from "node:crypto";
import { matchCampaign, selectPublicReply } from "./campaign-match";
import { createInteractionPayload, readInteractionPayload } from "./postback";
import type { FlowDefinitionV2, MediaSnapshot, NormalizedEvent } from "./types";
import { MetaApiError, type MetaClient } from "../meta/client";
import type { MetaConnection, MetaMedia, MetaMessage, MetaSendResult } from "../meta/types";
import type {
  AutomationParticipantRecord,
  AutomationRecord,
  AutomationRepository,
  ExecutionRecord,
  InstagramConnectionRecord,
  ParticipantState,
} from "../repository";
import { unsealSecret } from "../security/secrets";

const RECHECK_COOLDOWN_MS = 10_000;
const MAX_RECHECKS = 10;
const MESSAGE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const DISPATCH_LEASE_MS = 30_000;

const INTERACTION_EVENT_TYPES = new Set<NormalizedEvent["type"]>([
  "quick_reply.received",
  "postback.received",
  "optin.received",
  "referral.received",
]);

const PARTICIPANT_ACTION_STATES: ParticipantState[] = [
  "COMMENT_MATCHED",
  "OPENING_SENT",
  "OPTED_IN",
  "FOLLOW_REQUIRED",
  "FOLLOW_VERIFIED",
];

export type CampaignRunnerClient = Pick<
  MetaClient,
  | "replyToComment"
  | "sendPrivateReply"
  | "sendQuickReply"
  | "sendDirectMessage"
  | "getUserFollowStatus"
  | "getMedia"
>;

export type CampaignRunnerOptions = {
  client?: CampaignRunnerClient;
  tokenEncryptionKey?: string;
  interactionSecret?: string;
  finalAttempt?: boolean;
};

export type CampaignMapping = {
  workspaceId: string;
  connection: InstagramConnectionRecord;
};

export type CampaignRunnerResult = {
  handled: boolean;
  participantId?: string;
  matched: number;
  sent: number;
  skipped: number;
  failed: number;
};

export type PendingCampaignInteractionResult =
  | { handled: false }
  | { handled: true; result: CampaignRunnerResult };

function emptyResult(): CampaignRunnerResult {
  return { handled: false, matched: 0, sent: 0, skipped: 0, failed: 0 };
}

function handledResult(
  participantId: string | undefined,
  counts: Partial<Pick<CampaignRunnerResult, "sent" | "skipped" | "failed">> = {},
): CampaignRunnerResult {
  return {
    handled: true,
    ...(participantId ? { participantId } : {}),
    matched: 1,
    sent: counts.sent ?? 0,
    skipped: counts.skipped ?? 0,
    failed: counts.failed ?? 0,
  };
}

function metaConnection(
  connection: InstagramConnectionRecord,
  tokenEncryptionKey: string,
): MetaConnection {
  return {
    igUserId: connection.igUserId,
    accessToken: unsealSecret(connection.accessTokenEncrypted, tokenEncryptionKey),
  };
}

function actionDedupeKey(participantId: string, action: string): string {
  return `campaign:${participantId}:${action}`;
}

function actionClaim(
  participant: AutomationParticipantRecord,
  repository: AutomationRepository,
  action: string,
  externalEventId: string,
): Promise<boolean> {
  return repository.claimExecution({
    workspaceId: participant.workspaceId,
    automationId: participant.automationId,
    externalEventId,
    dedupeKey: actionDedupeKey(participant.id, action),
  });
}

function completeAction(
  participant: AutomationParticipantRecord,
  repository: AutomationRepository,
  action: string,
  status: "SENT" | "FAILED",
  providerMessageId?: string,
  reason?: string,
  providerRecipientId?: string,
): Promise<void> {
  return repository.completeExecution(
    participant.workspaceId,
    actionDedupeKey(participant.id, action),
    { status, providerMessageId, providerRecipientId, reason },
  );
}

function releaseAction(
  participant: AutomationParticipantRecord,
  repository: AutomationRepository,
  action: string,
): Promise<void> {
  return repository.releaseExecutionClaim(
    participant.workspaceId,
    actionDedupeKey(participant.id, action),
  );
}

function completeOwnedAction(
  participant: AutomationParticipantRecord,
  repository: AutomationRepository,
  action: string,
  dispatchOwner: string,
  status: "SENT" | "FAILED",
  providerMessageId?: string,
  reason?: string,
  providerRecipientId?: string,
): Promise<boolean> {
  return repository.completeOwnedExecution(
    participant.workspaceId,
    actionDedupeKey(participant.id, action),
    dispatchOwner,
    { status, providerMessageId, providerRecipientId, reason },
  );
}

function releaseOwnedAction(
  participant: AutomationParticipantRecord,
  repository: AutomationRepository,
  action: string,
  dispatchOwner: string,
): Promise<boolean> {
  return repository.releaseOwnedExecutionClaim(
    participant.workspaceId,
    actionDedupeKey(participant.id, action),
    dispatchOwner,
  );
}

function getActionExecution(
  participant: AutomationParticipantRecord,
  repository: AutomationRepository,
  action: string,
): Promise<ExecutionRecord | null> {
  return repository.getExecution(
    participant.workspaceId,
    actionDedupeKey(participant.id, action),
  );
}

type PreparedDeliveryAction =
  | { kind: "send"; dispatchOwner: string }
  | { kind: "sent"; execution: ExecutionRecord }
  | { kind: "failed"; reason: string }
  | { kind: "in_flight" };

async function prepareDeliveryAction(
  participant: AutomationParticipantRecord,
  repository: AutomationRepository,
  action: string,
  externalEventId: string,
): Promise<PreparedDeliveryAction> {
  const dedupeKey = actionDedupeKey(participant.id, action);
  const existing = await repository.getExecution(participant.workspaceId, dedupeKey);
  if (existing?.status === "SENT") return { kind: "sent", execution: existing };
  if (existing?.status === "FAILED") {
    return { kind: "failed", reason: existing.reason ?? "Meta delivery failed" };
  }
  if (existing?.status === "PROCESSING" && existing.dispatchStatus === "DISPATCHING") {
    const startedAt = existing.dispatchStartedAt ? Date.parse(existing.dispatchStartedAt) : Number.NaN;
    const leaseExpiresAt = existing.dispatchLeaseExpiresAt
      ? Date.parse(existing.dispatchLeaseExpiresAt)
      : Number.NaN;
    if (
      existing.dispatchOwner
      && Number.isFinite(startedAt)
      && Number.isFinite(leaseExpiresAt)
      && leaseExpiresAt > Date.now()
    ) return { kind: "in_flight" };

    const reason = "Meta delivery outcome is ambiguous after an abandoned dispatch lease";
    const failed = await repository.failAbandonedExecution(
      participant.workspaceId,
      dedupeKey,
      new Date().toISOString(),
      reason,
    );
    return failed
      ? { kind: "failed", reason }
      : prepareDeliveryAction(participant, repository, action, externalEventId);
  }
  if (existing?.status === "PROCESSING") {
    const reason = "Historical processing execution has no durable dispatch owner";
    await repository.completeExecution(participant.workspaceId, dedupeKey, { status: "FAILED", reason });
    return { kind: "failed", reason };
  }

  const dispatchStartedAt = Date.now();
  const dispatchOwner = randomUUID();
  const claimed = await repository.claimExecutionDispatch({
    workspaceId: participant.workspaceId,
    automationId: participant.automationId,
    externalEventId,
    dedupeKey,
    dispatchOwner,
    dispatchStartedAt: new Date(dispatchStartedAt).toISOString(),
    dispatchLeaseExpiresAt: new Date(dispatchStartedAt + DISPATCH_LEASE_MS).toISOString(),
  });
  return claimed
    ? { kind: "send", dispatchOwner }
    : prepareDeliveryAction(participant, repository, action, externalEventId);
}

function isKnownNotSentRetryable(error: unknown): error is MetaApiError {
  return error instanceof MetaApiError && error.status > 0 && error.retryable;
}

function isAmbiguousProviderOutcome(error: unknown): boolean {
  return !(error instanceof MetaApiError) || error.status === 0;
}

function looksLikeCampaignInteractionPayload(value: string): boolean {
  const separator = value.indexOf(".");
  if (separator <= 0) return false;
  const encoded = value.slice(0, separator);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return false;
  try {
    if (Buffer.from(encoded, "base64url").toString("base64url") !== encoded) return false;
    const body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
    return body.v === 1
      && typeof body.p === "string"
      && body.p.length > 0
      && (body.a === "opt_in" || body.a === "recheck");
  } catch {
    return false;
  }
}

async function currentParticipant(
  participant: AutomationParticipantRecord,
  repository: AutomationRepository,
): Promise<AutomationParticipantRecord> {
  return await repository.getParticipant(
    participant.workspaceId,
    participant.instagramAccountId,
    participant.id,
  ) ?? participant;
}

function mediaSnapshot(media: MetaMedia): MediaSnapshot {
  return {
    id: media.id,
    ...(media.caption !== undefined ? { caption: media.caption } : {}),
    mediaType: media.mediaType,
    ...(media.mediaProductType !== undefined ? { mediaProductType: media.mediaProductType } : {}),
    permalink: media.permalink,
    timestamp: media.timestamp,
  };
}

function boundDefinition(
  definition: FlowDefinitionV2,
  mediaId: string,
  snapshot?: MediaSnapshot,
): FlowDefinitionV2 {
  return {
    ...definition,
    trigger: {
      ...definition.trigger,
      source: "specific_media",
      mediaIds: [mediaId],
      mediaSnapshots: snapshot ? [snapshot] : [],
    },
  };
}

async function recordCampaignConfigurationResult(
  event: NormalizedEvent,
  automation: AutomationRecord,
  repository: AutomationRepository,
  status: "SKIPPED" | "FAILED",
  reason: string,
): Promise<CampaignRunnerResult> {
  await repository.recordExecution({
    workspaceId: automation.workspaceId,
    automationId: automation.id,
    externalEventId: event.id,
    dedupeKey: `${automation.id}:${event.id}:campaign:configuration`,
    status,
    reason,
  });
  return handledResult(undefined, status === "SKIPPED" ? { skipped: 1 } : { failed: 1 });
}

async function resolveNextMedia(
  event: NormalizedEvent,
  automation: AutomationRecord & { definition: FlowDefinitionV2 },
  mapping: CampaignMapping,
  repository: AutomationRepository,
  options: CampaignRunnerOptions,
): Promise<
  | { automation: AutomationRecord & { definition: FlowDefinitionV2 }; snapshot?: MediaSnapshot }
  | CampaignRunnerResult
  | null
> {
  const mediaId = event.mediaId;
  if (event.type !== "comment.created" || !mediaId) return null;

  if (automation.boundMediaId) {
    if (automation.boundMediaId !== mediaId) return null;
    return {
      automation: {
        ...automation,
        definition: boundDefinition(automation.definition, automation.boundMediaId),
      },
    };
  }

  if (!options.client) {
    return recordCampaignConfigurationResult(
      event,
      automation,
      repository,
      "SKIPPED",
      "Meta delivery is disabled in demo mode",
    );
  }
  if (!options.tokenEncryptionKey) {
    return recordCampaignConfigurationResult(
      event,
      automation,
      repository,
      "FAILED",
      "Token encryption key is not configured",
    );
  }

  const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
  let media: MetaMedia;
  try {
    media = await options.client.getMedia(connection, mediaId);
  } catch (error) {
    if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) throw error;
    return recordCampaignConfigurationResult(
      event,
      automation,
      repository,
      "FAILED",
      "Meta media lookup failed",
    );
  }

  const publishedAt = Date.parse(media.timestamp);
  const activatedAt = automation.activatedAt ? Date.parse(automation.activatedAt) : Number.NaN;
  if (
    media.id !== mediaId
    || !Number.isFinite(publishedAt)
    || !Number.isFinite(activatedAt)
    || publishedAt <= activatedAt
  ) {
    return null;
  }

  const won = await repository.bindNextMedia(
    mapping.workspaceId,
    automation.id,
    mediaId,
    new Date(publishedAt).toISOString(),
  );
  if (!won) {
    const current = await repository.getAutomation(mapping.workspaceId, automation.id);
    if (!current || current.definition.version !== 2 || current.boundMediaId !== mediaId) return null;
    return {
      automation: {
        ...current,
        definition: boundDefinition(current.definition, mediaId, mediaSnapshot(media)),
      },
      snapshot: mediaSnapshot(media),
    };
  }

  const snapshot = mediaSnapshot(media);
  return {
    automation: {
      ...automation,
      boundMediaId: mediaId,
      definition: boundDefinition(automation.definition, mediaId, snapshot),
    },
    snapshot,
  };
}

async function deliverPublicReply(
  participant: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  client: CampaignRunnerClient,
  connection: MetaConnection,
  repository: AutomationRepository,
  finalAttempt: boolean,
): Promise<AutomationParticipantRecord> {
  const text = selectPublicReply(
    definition.publicReplies,
    participant.automationId,
    participant.sourceCommentId,
  );
  if (!text) {
    const skipped = await repository.transitionParticipant(
      participant.id,
      PARTICIPANT_ACTION_STATES,
      { publicReplyStatus: "SKIPPED" },
    );
    return skipped ?? participant;
  }

  const action = "public_reply";
  const prepared = await prepareDeliveryAction(
    participant,
    repository,
    action,
    participant.sourceCommentId,
  );
  if (prepared.kind === "in_flight") return currentParticipant(participant, repository);
  if (prepared.kind === "sent") {
    const sent = await repository.transitionParticipant(
      participant.id,
      PARTICIPANT_ACTION_STATES,
      {
        publicReplyStatus: "SENT",
        publicReplyProviderId: prepared.execution.providerMessageId,
        publicReplySentAt: prepared.execution.createdAt,
        publicReplyError: undefined,
      },
    );
    return sent ?? currentParticipant(participant, repository);
  }
  if (prepared.kind === "failed") {
    const failed = await repository.transitionParticipant(participant.id, PARTICIPANT_ACTION_STATES, {
      publicReplyStatus: "FAILED",
      publicReplyError: prepared.reason,
    });
    return failed ?? currentParticipant(participant, repository);
  }

  let response: { id: string };
  try {
    response = await client.replyToComment(
      connection,
      participant.sourceCommentId,
      text,
    );
    const completed = await completeOwnedAction(
      participant,
      repository,
      action,
      prepared.dispatchOwner,
      "SENT",
      response.id,
    );
    if (!completed) {
      if (await getActionExecution(participant, repository, action)) {
        return deliverPublicReply(participant, definition, client, connection, repository, finalAttempt);
      }
      const failed = await repository.transitionParticipant(participant.id, PARTICIPANT_ACTION_STATES, {
        publicReplyStatus: "FAILED",
        publicReplyError: "Meta public reply dispatch ownership was lost",
      });
      return failed ?? currentParticipant(participant, repository);
    }
  } catch (error) {
    if (isKnownNotSentRetryable(error) && !finalAttempt) {
      const released = await releaseOwnedAction(
        participant,
        repository,
        action,
        prepared.dispatchOwner,
      );
      if (!released) {
        if (await getActionExecution(participant, repository, action)) {
          return deliverPublicReply(participant, definition, client, connection, repository, finalAttempt);
        }
        return currentParticipant(participant, repository);
      }
      await repository.transitionParticipant(participant.id, PARTICIPANT_ACTION_STATES, {
        publicReplyStatus: "PENDING",
        publicReplyError: "Meta public reply temporarily failed",
      });
      throw error;
    }

    const reason = isAmbiguousProviderOutcome(error)
      ? "Meta public reply outcome is ambiguous; delivery was not retried"
      : "Meta public reply failed";
    const failedPersisted = await completeOwnedAction(
      participant,
      repository,
      action,
      prepared.dispatchOwner,
      "FAILED",
      undefined,
      reason,
    );
    if (!failedPersisted && await getActionExecution(participant, repository, action)) {
      return deliverPublicReply(participant, definition, client, connection, repository, finalAttempt);
    }
    const failed = await repository.transitionParticipant(
      participant.id,
      PARTICIPANT_ACTION_STATES,
      { publicReplyStatus: "FAILED", publicReplyError: reason },
    );
    return failed ?? currentParticipant(participant, repository);
  }

  const sent = await repository.transitionParticipant(
    participant.id,
    PARTICIPANT_ACTION_STATES,
    {
      publicReplyStatus: "SENT",
      publicReplyProviderId: response.id,
      publicReplySentAt: new Date().toISOString(),
      publicReplyError: undefined,
    },
  );
  return sent ?? currentParticipant(participant, repository);
}

async function deliverOpeningReply(
  participant: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  client: CampaignRunnerClient,
  connection: MetaConnection,
  repository: AutomationRepository,
  interactionSecret: string,
  finalAttempt: boolean,
): Promise<AutomationParticipantRecord> {
  const action = "opening_reply";
  const prepared = await prepareDeliveryAction(
    participant,
    repository,
    action,
    participant.sourceCommentId,
  );
  if (prepared.kind === "in_flight") return currentParticipant(participant, repository);
  if (prepared.kind === "sent") {
    if (!prepared.execution.providerMessageId || !prepared.execution.providerRecipientId) {
      const reason = "Recorded opening delivery success is missing provider identifiers";
      const failed = await repository.transitionParticipant(participant.id, ["COMMENT_MATCHED"], {
        state: "FAILED",
        openingStatus: "FAILED",
        openingError: reason,
      });
      return failed ?? currentParticipant(participant, repository);
    }
    const sent = await repository.transitionParticipant(
      participant.id,
      ["COMMENT_MATCHED"],
      {
        state: "OPENING_SENT",
        openingStatus: "SENT",
        openingProviderId: prepared.execution.providerMessageId,
        openingSentAt: prepared.execution.createdAt,
        openingError: undefined,
        igScopedUserId: prepared.execution.providerRecipientId,
      },
    );
    return sent ?? currentParticipant(participant, repository);
  }
  if (prepared.kind === "failed") {
    const failed = await repository.transitionParticipant(participant.id, ["COMMENT_MATCHED"], {
      state: "FAILED",
      openingStatus: "FAILED",
      openingError: prepared.reason,
    });
    return failed ?? currentParticipant(participant, repository);
  }

  let response: MetaSendResult;
  try {
    response = await client.sendPrivateReply(
      connection,
      participant.sourceCommentId,
      {
        text: definition.openingMessage.text,
        quickReply: {
          title: definition.openingMessage.optInButtonLabel,
          payload: createInteractionPayload(
            { participantId: participant.id, action: "opt_in" },
            interactionSecret,
          ),
        },
      },
    );
    if (!response.message_id || !response.recipient_id) {
      throw new Error("Meta accepted the opening reply without delivery identifiers");
    }

    const completed = await completeOwnedAction(
      participant,
      repository,
      action,
      prepared.dispatchOwner,
      "SENT",
      response.message_id,
      undefined,
      response.recipient_id,
    );
    if (!completed) {
      if (await getActionExecution(participant, repository, action)) {
        return deliverOpeningReply(
          participant,
          definition,
          client,
          connection,
          repository,
          interactionSecret,
          finalAttempt,
        );
      }
      const failed = await repository.transitionParticipant(participant.id, ["COMMENT_MATCHED"], {
        state: "FAILED",
        openingStatus: "FAILED",
        openingError: "Meta opening reply dispatch ownership was lost",
      });
      return failed ?? currentParticipant(participant, repository);
    }
  } catch (error) {
    if (isKnownNotSentRetryable(error) && !finalAttempt) {
      const released = await releaseOwnedAction(
        participant,
        repository,
        action,
        prepared.dispatchOwner,
      );
      if (!released) {
        if (await getActionExecution(participant, repository, action)) {
          return deliverOpeningReply(
            participant,
            definition,
            client,
            connection,
            repository,
            interactionSecret,
            finalAttempt,
          );
        }
        return currentParticipant(participant, repository);
      }
      await repository.transitionParticipant(participant.id, ["COMMENT_MATCHED"], {
        openingStatus: "PENDING",
        openingError: "Meta opening reply temporarily failed",
      });
      throw error;
    }

    const reason = isAmbiguousProviderOutcome(error)
      ? "Meta opening reply outcome is ambiguous; delivery was not retried"
      : "Meta opening reply failed";
    const failedPersisted = await completeOwnedAction(
      participant,
      repository,
      action,
      prepared.dispatchOwner,
      "FAILED",
      undefined,
      reason,
    );
    if (!failedPersisted && await getActionExecution(participant, repository, action)) {
      return deliverOpeningReply(
        participant,
        definition,
        client,
        connection,
        repository,
        interactionSecret,
        finalAttempt,
      );
    }
    const failed = await repository.transitionParticipant(
      participant.id,
      ["COMMENT_MATCHED"],
      {
        state: "FAILED",
        openingStatus: "FAILED",
        openingError: reason,
      },
    );
    return failed ?? currentParticipant(participant, repository);
  }

  const sent = await repository.transitionParticipant(
    participant.id,
    ["COMMENT_MATCHED"],
    {
      state: "OPENING_SENT",
      openingStatus: "SENT",
      openingProviderId: response.message_id,
      openingSentAt: new Date().toISOString(),
      openingError: undefined,
      igScopedUserId: response.recipient_id,
    },
  );
  return sent ?? currentParticipant(participant, repository);
}

async function promptForFollow(
  participant: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  event: NormalizedEvent,
  client: CampaignRunnerClient,
  connection: MetaConnection,
  repository: AutomationRepository,
  interactionSecret: string,
  actionPurpose: "opt_in" | "recheck",
  finalAttempt: boolean,
): Promise<AutomationParticipantRecord> {
  const action = `follow_prompt:${event.id}`;
  const prepared = await prepareDeliveryAction(participant, repository, action, event.id);
  if (prepared.kind === "in_flight") return currentParticipant(participant, repository);
  if (prepared.kind === "sent") {
    const prompted = await repository.transitionParticipant(
      participant.id,
      [participant.state],
      {
        state: "FOLLOW_REQUIRED",
        followStatus: false,
        followCheckedAt: new Date(event.timestamp).toISOString(),
        followCheckError: undefined,
        messagingWindowExpiresAt: new Date(event.timestamp + MESSAGE_WINDOW_MS).toISOString(),
        recheckCount: participant.recheckCount + (actionPurpose === "recheck" ? 1 : 0),
      },
    );
    return prompted ?? currentParticipant(participant, repository);
  }
  if (prepared.kind === "failed") {
    const failed = await repository.transitionParticipant(participant.id, [participant.state], {
      state: "FAILED",
      finalDeliveryError: prepared.reason,
    });
    return failed ?? currentParticipant(participant, repository);
  }

  let response: MetaSendResult;
  try {
    response = await client.sendQuickReply(
      connection,
      event.recipientId!,
      definition.followGate.notFollowingMessage,
      {
        title: definition.followGate.recheckButtonLabel,
        payload: createInteractionPayload(
          { participantId: participant.id, action: "recheck" },
          interactionSecret,
          event.timestamp,
        ),
      },
    );
    if (!response.message_id) {
      throw new Error("Meta accepted the follow prompt without a delivery identifier");
    }

    const completed = await completeOwnedAction(
      participant,
      repository,
      action,
      prepared.dispatchOwner,
      "SENT",
      response.message_id,
    );
    if (!completed) {
      if (await getActionExecution(participant, repository, action)) {
        return promptForFollow(
          participant,
          definition,
          event,
          client,
          connection,
          repository,
          interactionSecret,
          actionPurpose,
          finalAttempt,
        );
      }
      return currentParticipant(participant, repository);
    }
  } catch (error) {
    if (isKnownNotSentRetryable(error) && !finalAttempt) {
      const released = await releaseOwnedAction(
        participant,
        repository,
        action,
        prepared.dispatchOwner,
      );
      if (!released) {
        if (await getActionExecution(participant, repository, action)) {
          return promptForFollow(
            participant,
            definition,
            event,
            client,
            connection,
            repository,
            interactionSecret,
            actionPurpose,
            finalAttempt,
          );
        }
        return currentParticipant(participant, repository);
      }
      throw error;
    }

    const reason = isAmbiguousProviderOutcome(error)
      ? "Meta follow prompt outcome is ambiguous; delivery was not retried"
      : "Meta follow prompt failed";
    const failedPersisted = await completeOwnedAction(
      participant,
      repository,
      action,
      prepared.dispatchOwner,
      "FAILED",
      undefined,
      reason,
    );
    if (!failedPersisted && await getActionExecution(participant, repository, action)) {
      return promptForFollow(
        participant,
        definition,
        event,
        client,
        connection,
        repository,
        interactionSecret,
        actionPurpose,
        finalAttempt,
      );
    }
    const failed = await repository.transitionParticipant(participant.id, [participant.state], {
      state: "FAILED",
      finalDeliveryError: reason,
    });
    return failed ?? currentParticipant(participant, repository);
  }

  const prompted = await repository.transitionParticipant(
    participant.id,
    [participant.state],
    {
      state: "FOLLOW_REQUIRED",
      followStatus: false,
      followCheckedAt: new Date(event.timestamp).toISOString(),
      followCheckError: undefined,
      messagingWindowExpiresAt: new Date(event.timestamp + MESSAGE_WINDOW_MS).toISOString(),
      recheckCount: participant.recheckCount + (actionPurpose === "recheck" ? 1 : 0),
    },
  );
  return prompted ?? currentParticipant(participant, repository);
}

async function deliverFinalMessage(
  verified: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  event: NormalizedEvent,
  client: CampaignRunnerClient,
  connection: MetaConnection,
  repository: AutomationRepository,
  finalAttempt: boolean,
): Promise<AutomationParticipantRecord> {
  const action = "final_delivery";
  const prepared = await prepareDeliveryAction(verified, repository, action, event.id);
  if (prepared.kind === "in_flight") return currentParticipant(verified, repository);
  if (prepared.kind === "sent") {
    if (!prepared.execution.providerMessageId) {
      const reason = "Recorded final delivery success is missing provider identifier";
      const failed = await repository.transitionParticipant(verified.id, ["FOLLOW_VERIFIED"], {
        state: "FAILED",
        finalDeliveryStatus: "FAILED",
        finalDeliveryError: reason,
      });
      return failed ?? currentParticipant(verified, repository);
    }
    const delivered = await repository.transitionParticipant(
      verified.id,
      ["FOLLOW_VERIFIED"],
      {
        state: "LINK_SENT",
        finalDeliveryStatus: "SENT",
        finalProviderId: prepared.execution.providerMessageId,
        finalDeliveredAt: prepared.execution.createdAt,
        finalDeliveryError: undefined,
      },
    );
    return delivered ?? currentParticipant(verified, repository);
  }
  if (prepared.kind === "failed") {
    const failed = await repository.transitionParticipant(verified.id, ["FOLLOW_VERIFIED"], {
      state: "FAILED",
      finalDeliveryStatus: "FAILED",
      finalDeliveryError: prepared.reason,
    });
    return failed ?? currentParticipant(verified, repository);
  }

  const message: MetaMessage = definition.delivery.buttonLabel
    ? {
        type: "button",
        text: definition.delivery.text,
        buttonLabel: definition.delivery.buttonLabel,
        url: definition.delivery.url,
      }
    : { type: "link", text: definition.delivery.text, url: definition.delivery.url };

  let response: MetaSendResult;
  try {
    response = await client.sendDirectMessage(
      connection,
      event.recipientId!,
      message,
    );
    if (!response.message_id) {
      throw new Error("Meta accepted the final delivery without a delivery identifier");
    }

    const completed = await completeOwnedAction(
      verified,
      repository,
      action,
      prepared.dispatchOwner,
      "SENT",
      response.message_id,
    );
    if (!completed) {
      if (await getActionExecution(verified, repository, action)) {
        return deliverFinalMessage(
          verified,
          definition,
          event,
          client,
          connection,
          repository,
          finalAttempt,
        );
      }
      const failed = await repository.transitionParticipant(verified.id, ["FOLLOW_VERIFIED"], {
        state: "FAILED",
        finalDeliveryStatus: "FAILED",
        finalDeliveryError: "Meta final delivery dispatch ownership was lost",
      });
      return failed ?? currentParticipant(verified, repository);
    }
  } catch (error) {
    if (isKnownNotSentRetryable(error) && !finalAttempt) {
      const released = await releaseOwnedAction(
        verified,
        repository,
        action,
        prepared.dispatchOwner,
      );
      if (!released) {
        if (await getActionExecution(verified, repository, action)) {
          return deliverFinalMessage(
            verified,
            definition,
            event,
            client,
            connection,
            repository,
            finalAttempt,
          );
        }
        return currentParticipant(verified, repository);
      }
      await repository.transitionParticipant(verified.id, ["FOLLOW_VERIFIED"], {
        finalDeliveryStatus: "PENDING",
        finalDeliveryError: "Meta final delivery temporarily failed",
      });
      throw error;
    }

    const reason = isAmbiguousProviderOutcome(error)
      ? "Meta final delivery outcome is ambiguous; delivery was not retried"
      : "Meta final delivery failed";
    const failedPersisted = await completeOwnedAction(
      verified,
      repository,
      action,
      prepared.dispatchOwner,
      "FAILED",
      undefined,
      reason,
    );
    if (!failedPersisted && await getActionExecution(verified, repository, action)) {
      return deliverFinalMessage(
        verified,
        definition,
        event,
        client,
        connection,
        repository,
        finalAttempt,
      );
    }
    const failed = await repository.transitionParticipant(verified.id, ["FOLLOW_VERIFIED"], {
      state: "FAILED",
      finalDeliveryStatus: "FAILED",
      finalDeliveryError: reason,
    });
    return failed ?? currentParticipant(verified, repository);
  }

  const delivered = await repository.transitionParticipant(
    verified.id,
    ["FOLLOW_VERIFIED"],
    {
      state: "LINK_SENT",
      finalDeliveryStatus: "SENT",
      finalProviderId: response.message_id,
      finalDeliveredAt: new Date().toISOString(),
      finalDeliveryError: undefined,
    },
  );
  return delivered ?? currentParticipant(verified, repository);
}

async function verifyAndDeliver(
  participant: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  event: NormalizedEvent,
  client: CampaignRunnerClient,
  connection: MetaConnection,
  repository: AutomationRepository,
  finalAttempt: boolean,
): Promise<AutomationParticipantRecord> {
  const verified = await repository.transitionParticipant(
    participant.id,
    [participant.state],
    {
      state: "FOLLOW_VERIFIED",
      followStatus: true,
      followCheckedAt: new Date(event.timestamp).toISOString(),
      followCheckError: undefined,
      messagingWindowExpiresAt: new Date(event.timestamp + MESSAGE_WINDOW_MS).toISOString(),
      finalDeliveryStatus: "PENDING",
    },
  );
  if (!verified) return currentParticipant(participant, repository);
  return deliverFinalMessage(
    verified,
    definition,
    event,
    client,
    connection,
    repository,
    finalAttempt,
  );
}

export async function processExistingCampaignParticipant(
  participant: AutomationParticipantRecord,
  mapping: CampaignMapping,
  repository: AutomationRepository,
  options: CampaignRunnerOptions,
): Promise<CampaignRunnerResult> {
  if (["LINK_SENT", "EXPIRED", "FAILED"].includes(participant.state)) {
    return handledResult(participant.id);
  }

  const automation = await repository.getAutomation(participant.workspaceId, participant.automationId);
  if (!automation || automation.definition.version !== 2) {
    await repository.transitionParticipant(participant.id, [participant.state], {
      state: "FAILED",
      openingError: "Original campaign definition is unavailable",
    });
    return handledResult(participant.id, { failed: 1 });
  }
  if (!options.client) {
    return handledResult(participant.id, { skipped: 1 });
  }
  if (!options.tokenEncryptionKey || !options.interactionSecret) {
    await repository.transitionParticipant(participant.id, [participant.state], {
      state: "FAILED",
      openingError: !options.tokenEncryptionKey
        ? "Token encryption key is not configured"
        : "Interaction signing secret is not configured",
    });
    return handledResult(participant.id, { failed: 1 });
  }

  const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
  if (participant.publicReplyStatus !== "SENT" && participant.publicReplyStatus !== "SKIPPED") {
    participant = await deliverPublicReply(
      participant,
      automation.definition,
      options.client,
      connection,
      repository,
      options.finalAttempt === true,
    );
  }
  if (participant.openingStatus !== "SENT" && participant.state !== "FAILED") {
    participant = await deliverOpeningReply(
      participant,
      automation.definition,
      options.client,
      connection,
      repository,
      options.interactionSecret,
      options.finalAttempt === true,
    );
  }

  participant = await currentParticipant(participant, repository);
  if (participant.openingStatus === "SENT") {
    return handledResult(participant.id, { sent: 1 });
  }
  if (participant.state === "FAILED" || participant.openingStatus === "FAILED") {
    return handledResult(participant.id, { failed: 1 });
  }
  return handledResult(participant.id);
}

export async function processCampaignEvent(
  event: NormalizedEvent,
  automation: AutomationRecord,
  mapping: CampaignMapping,
  repository: AutomationRepository,
  options: CampaignRunnerOptions,
): Promise<CampaignRunnerResult> {
  if (event.type === "comment.created" && event.commentId) {
    const existing = await repository.findParticipantBySource(
      mapping.workspaceId,
      event.accountId,
      event.commentId,
    );
    if (existing) {
      return processExistingCampaignParticipant(existing, mapping, repository, options);
    }
  }
  if (automation.definition.version !== 2) return emptyResult();
  let campaign = automation as AutomationRecord & { definition: FlowDefinitionV2 };
  let resolvedSnapshot: MediaSnapshot | undefined;

  if (campaign.definition.trigger.source === "next_media") {
    const resolved = await resolveNextMedia(event, campaign, mapping, repository, options);
    if (!resolved) return emptyResult();
    if ("handled" in resolved) return resolved;
    campaign = resolved.automation;
    resolvedSnapshot = resolved.snapshot;
  }

  const match = matchCampaign(campaign.definition, event);
  if (!match.matched) return emptyResult();

  if (!event.commentId || !event.mediaId) {
    return recordCampaignConfigurationResult(
      event,
      campaign,
      repository,
      "FAILED",
      "Campaign comments require comment and media IDs",
    );
  }
  if (!options.client) {
    return recordCampaignConfigurationResult(
      event,
      campaign,
      repository,
      "SKIPPED",
      "Meta delivery is disabled in demo mode",
    );
  }
  if (!options.tokenEncryptionKey) {
    return recordCampaignConfigurationResult(
      event,
      campaign,
      repository,
      "FAILED",
      "Token encryption key is not configured",
    );
  }
  if (!options.interactionSecret) {
    return recordCampaignConfigurationResult(
      event,
      campaign,
      repository,
      "FAILED",
      "Interaction signing secret is not configured",
    );
  }

  const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
  let snapshot = resolvedSnapshot
    ?? campaign.definition.trigger.mediaSnapshots.find((candidate) => candidate.id === event.mediaId);
  if (!snapshot) {
    try {
      const media = await options.client.getMedia(connection, event.mediaId);
      if (media.id !== event.mediaId) {
        return recordCampaignConfigurationResult(
          event,
          campaign,
          repository,
          "FAILED",
          "Meta media lookup did not match the comment media",
        );
      }
      snapshot = mediaSnapshot(media);
    } catch (error) {
      if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) throw error;
      return recordCampaignConfigurationResult(
        event,
        campaign,
        repository,
        "FAILED",
        "Meta media lookup failed",
      );
    }
  }

  const created = await repository.createParticipant({
    workspaceId: mapping.workspaceId,
    automationId: campaign.id,
    instagramAccountId: event.accountId,
    sourceCommentId: event.commentId,
    sourceMediaId: event.mediaId,
    sourceMediaSnapshot: snapshot,
    ...(match.keyword ? { matchedKeyword: match.keyword } : {}),
  });
  return processExistingCampaignParticipant(created.record, mapping, repository, options);
}

async function failInteractionParticipant(
  participant: AutomationParticipantRecord,
  repository: AutomationRepository,
  reason: string,
): Promise<CampaignRunnerResult> {
  await repository.transitionParticipant(participant.id, [participant.state], {
    state: "FAILED",
    followCheckError: reason,
  });
  return handledResult(participant.id, { failed: 1 });
}

export async function processPendingCampaignInteraction(
  event: NormalizedEvent,
  mapping: CampaignMapping,
  repository: AutomationRepository,
  options: CampaignRunnerOptions,
): Promise<PendingCampaignInteractionResult> {
  if (!INTERACTION_EVENT_TYPES.has(event.type) || event.interactionPayload === undefined || !event.recipientId) {
    return { handled: false };
  }

  const campaignPayload = looksLikeCampaignInteractionPayload(event.interactionPayload);

  if (!options.interactionSecret) {
    return campaignPayload
      ? { handled: true, result: handledResult(undefined, { failed: 1 }) }
      : { handled: false };
  }

  const payload = readInteractionPayload(
    event.interactionPayload,
    options.interactionSecret,
    event.timestamp,
  );
  if (!payload) {
    return campaignPayload
      ? { handled: true, result: handledResult(undefined, { failed: 1 }) }
      : { handled: false };
  }

  let participant = await repository.getParticipant(
    mapping.workspaceId,
    event.accountId,
    payload.participantId,
  );
  if (!participant || participant.igScopedUserId !== event.recipientId) {
    return { handled: true, result: handledResult(undefined, { failed: 1 }) };
  }

  const automation = await repository.getAutomation(mapping.workspaceId, participant.automationId);
  if (!automation || automation.definition.version !== 2) {
    return { handled: true, result: handledResult(participant.id, { failed: 1 }) };
  }
  const definition = automation.definition;

  const purposeAllowed = payload.action === "opt_in"
    ? ["OPENING_SENT", "OPTED_IN", "FOLLOW_VERIFIED"].includes(participant.state)
    : ["FOLLOW_REQUIRED", "FOLLOW_VERIFIED"].includes(participant.state);
  if (!purposeAllowed) {
    return { handled: true, result: handledResult(participant.id) };
  }

  const verifiedAt = participant.followCheckedAt ? Date.parse(participant.followCheckedAt) : Number.NaN;
  if (
    participant.state === "FOLLOW_VERIFIED"
    && participant.finalDeliveryStatus === "PENDING"
    && Number.isFinite(verifiedAt)
    && verifiedAt === event.timestamp
  ) {
    const expiresAt = participant.messagingWindowExpiresAt
      ? Date.parse(participant.messagingWindowExpiresAt)
      : Number.NaN;
    if (!Number.isFinite(expiresAt) || event.timestamp >= expiresAt) {
      await repository.transitionParticipant(participant.id, ["FOLLOW_VERIFIED"], {
        state: "EXPIRED",
        finalDeliveryError: "Messaging window expired",
      });
      return { handled: true, result: handledResult(participant.id, { failed: 1 }) };
    }
    if (!options.client) {
      return {
        handled: true,
        result: await failInteractionParticipant(
          participant,
          repository,
          "Meta delivery is disabled in demo mode",
        ),
      };
    }
    if (!options.tokenEncryptionKey) {
      return {
        handled: true,
        result: await failInteractionParticipant(
          participant,
          repository,
          "Token encryption key is not configured",
        ),
      };
    }
    const resumed = await deliverFinalMessage(
      participant,
      definition,
      event,
      options.client,
      metaConnection(mapping.connection, options.tokenEncryptionKey),
      repository,
      options.finalAttempt === true,
    );
    if (resumed.state === "LINK_SENT") {
      return { handled: true, result: handledResult(resumed.id, { sent: 1 }) };
    }
    if (resumed.state === "FAILED") {
      return { handled: true, result: handledResult(resumed.id, { failed: 1 }) };
    }
    return { handled: true, result: handledResult(resumed.id) };
  }

  if (payload.action === "opt_in") {
    if (participant.state === "OPENING_SENT") {
      const optedIn = await repository.transitionParticipant(participant.id, ["OPENING_SENT"], {
        state: "OPTED_IN",
        igScopedUserId: event.recipientId,
        messagingWindowExpiresAt: new Date(event.timestamp + MESSAGE_WINDOW_MS).toISOString(),
      });
      if (!optedIn) return { handled: true, result: handledResult(participant.id) };
      participant = optedIn;
    } else if (participant.state !== "OPTED_IN" && participant.state !== "FOLLOW_VERIFIED") {
      return { handled: true, result: handledResult(participant.id) };
    }
  } else {
    if (participant.state !== "FOLLOW_REQUIRED" && participant.state !== "FOLLOW_VERIFIED") {
      return { handled: true, result: handledResult(participant.id) };
    }
    const expiresAt = participant.messagingWindowExpiresAt
      ? Date.parse(participant.messagingWindowExpiresAt)
      : Number.NaN;
    if (!Number.isFinite(expiresAt) || event.timestamp >= expiresAt) {
      await repository.transitionParticipant(participant.id, [participant.state], {
        state: "EXPIRED",
        finalDeliveryError: "Messaging window expired",
      });
      return { handled: true, result: handledResult(participant.id, { failed: 1 }) };
    }
    if (participant.recheckCount >= MAX_RECHECKS) {
      return { handled: true, result: handledResult(participant.id) };
    }
    const checkedAt = participant.followCheckedAt ? Date.parse(participant.followCheckedAt) : Number.NaN;
    if (Number.isFinite(checkedAt) && event.timestamp - checkedAt < RECHECK_COOLDOWN_MS) {
      return { handled: true, result: handledResult(participant.id) };
    }
  }

  if (!options.client) {
    return {
      handled: true,
      result: await failInteractionParticipant(
        participant,
        repository,
        "Meta delivery is disabled in demo mode",
      ),
    };
  }
  if (!options.tokenEncryptionKey) {
    return {
      handled: true,
      result: await failInteractionParticipant(
        participant,
        repository,
        "Token encryption key is not configured",
      ),
    };
  }

  const followCheckAction = payload.action === "recheck"
    ? `follow_check:recheck:${participant.recheckCount + 1}`
    : "follow_check:opt_in";
  if (!await actionClaim(participant, repository, followCheckAction, event.id)) {
    return { handled: true, result: handledResult(participant.id) };
  }

  const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
  let follows: boolean;
  try {
    const response = await options.client.getUserFollowStatus(connection, event.recipientId);
    if (response.isUserFollowingBusiness !== true && response.isUserFollowingBusiness !== false) {
      throw new Error("Meta did not return follower status");
    }
    follows = response.isUserFollowingBusiness;
  } catch (error) {
    if (isKnownNotSentRetryable(error) && !options.finalAttempt) {
      await releaseAction(participant, repository, followCheckAction);
      throw error;
    }
    await completeAction(
      participant,
      repository,
      followCheckAction,
      "FAILED",
      undefined,
      "Follower verification failed",
    );
    return {
      handled: true,
      result: await failInteractionParticipant(
        participant,
        repository,
        "Follower verification failed",
      ),
    };
  }

  let updated: AutomationParticipantRecord;
  try {
    if (follows) {
      updated = await verifyAndDeliver(
        participant,
        definition,
        event,
        options.client,
        connection,
        repository,
        options.finalAttempt === true,
      );
    } else if (participant.state === "FOLLOW_VERIFIED") {
      await completeAction(
        participant,
        repository,
        followCheckAction,
        "FAILED",
        undefined,
        "Follower status changed before delivery",
      );
      return {
        handled: true,
        result: await failInteractionParticipant(
          participant,
          repository,
          "Follower status changed before delivery",
        ),
      };
    } else {
      updated = await promptForFollow(
        participant,
        definition,
        event,
        options.client,
        connection,
        repository,
        options.interactionSecret,
        payload.action,
        options.finalAttempt === true,
      );
    }
  } catch (error) {
    await releaseAction(participant, repository, followCheckAction);
    throw error;
  }

  await completeAction(participant, repository, followCheckAction, "SENT");
  if (updated.state === "LINK_SENT" || updated.state === "FOLLOW_REQUIRED") {
    return { handled: true, result: handledResult(updated.id, { sent: 1 }) };
  }
  if (updated.state === "FAILED") {
    return { handled: true, result: handledResult(updated.id, { failed: 1 }) };
  }
  return { handled: true, result: handledResult(updated.id) };
}
