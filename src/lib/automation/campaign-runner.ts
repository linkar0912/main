import { randomUUID } from "node:crypto";
import { matchCampaign, selectPublicReply } from "./campaign-match";
import { createInteractionPayload, decodeInteractionPayloadShape, readInteractionPayload } from "./postback";
import type { FlowDefinitionV2, MediaSnapshot, NormalizedEvent } from "./types";
import { withinSchedule } from "./types";
import { getServerEnv } from "../env";
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
import type { ParticipantPatch } from "../repository";
import { unsealSecret } from "../security/secrets";
import { releaseDailySendSlots, renderTemplate, reserveDailySendSlots } from "./send-limits";
import { deliveryKeys, executeOutboundDelivery } from "./outbound-delivery";
import { checkSendRateLimit, type SendRateLimitBucket } from "./send-rate-limiter";
import { MESSAGING_WINDOW_MS } from "../messaging-window";
import type { DeliveryTimingObserver } from "./delivery-timing";

const RECHECK_COOLDOWN_MS = 10_000;
const MAX_RECHECKS = 10;

const DEFAULT_DISPATCH_LEASE_MS = 30_000;

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
> & {
  /**
   * Optional multi-chip quick replies used by classic flow actions; campaigns
   * never call it, so test stubs may omit it.
   */
  sendQuickReplies?(
    connection: MetaConnection,
    recipientId: string,
    text: string,
    replies: string[],
  ): Promise<{ message_id?: string }>;
};

export type CampaignRunnerOptions = {
  client?: CampaignRunnerClient;
  tokenEncryptionKey?: string;
  interactionSecret?: string;
  finalAttempt?: boolean;
  dispatchLeaseMs?: number;
  timingObserver?: DeliveryTimingObserver;
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

/**
 * Picks one message variant per participant deterministically-ish: a random
 * draw spread across the configured variants. Falls back to the base text.
 * The returned label ("A" for the base text, "B"/"C"... for variants) is
 * persisted per participant so A/B performance can be reported later.
 */
function pickVariant(text: string, variants: string[] | undefined): { text: string; label: string } {
  const options = [text, ...(variants ?? [])].filter((candidate) => candidate.trim().length > 0);
  if (options.length <= 1) return { text, label: "A" };
  const index = Math.floor(Math.random() * options.length);
  return { text: options[index], label: String.fromCharCode(65 + Math.min(index, 25)) };
}

/** Wraps the delivery link through the click-tracking redirect. */
function trackedDeliveryUrl(participantId: string, targetUrl: string): string {
  try {
    return new URL(`/api/t/${participantId}`, getServerEnv().appUrl).toString();
  } catch {
    return targetUrl;
  }
}

function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
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
  dispatchLeaseMs: number,
): Promise<PreparedDeliveryAction> {
  // Loop instead of recursing on contention so pathological claim races cannot
  // build up unbounded call stacks; each iteration re-reads current state.
  for (; ;) {
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
      if (failed) return { kind: "failed", reason };
      continue;
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
      dispatchLeaseExpiresAt: new Date(dispatchStartedAt + dispatchLeaseMs).toISOString(),
    });
    if (claimed) return { kind: "send", dispatchOwner };
  }
}

function isKnownNotSentRetryable(error: unknown): error is MetaApiError {
  return error instanceof MetaApiError && error.status > 0 && error.retryable;
}

function looksLikeCampaignInteractionPayload(value: string): boolean {
  const separator = value.indexOf(".");
  if (separator <= 0) return false;
  return decodeInteractionPayloadShape(value.slice(0, separator)) !== null;
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

// ---------------------------------------------------------------------------
// Guarded delivery
//
// Every outbound Meta action (public reply, opening DM, follow prompt, final
// delivery) shares the same crash-safe protocol: claim a dispatch lease, send,
// persist the outcome under the lease owner, and reconcile contention (another
// worker completed it, lease expired, ownership lost). The spec below captures
// what varies per action; guardedDelivery implements the shared protocol once.
// ---------------------------------------------------------------------------

type DeliveryContext = {
  client: CampaignRunnerClient;
  connection: MetaConnection;
  repository: AutomationRepository;
  interactionSecret: string;
  finalAttempt: boolean;
  dispatchLeaseMs: number;
  timingObserver?: DeliveryTimingObserver;
};

type GuardedDeliverySpec = {
  action: string;
  externalEventId: string;
  payload: Record<string, unknown>;
  dailySendLimit?: number;
  allowedStates: ParticipantState[];
  /** Sends via Meta; throws on provider-side rejection or missing identifiers. */
  send: (payload: Record<string, unknown>) => Promise<{ messageId?: string; recipientId?: string }>;
  /** Patch applied when a previous attempt already recorded SENT for this action. */
  onRecordedSent: (execution: ExecutionRecord) => ParticipantPatch;
  /** When non-null, a recorded SENT execution missing identifiers is treated as a failure. */
  validateRecordedExecution?: (execution: ExecutionRecord) => string | null;
  /** Patch applied after this worker's own successful send. */
  onSuccess: (ids: { messageId?: string; recipientId?: string }) => ParticipantPatch;
  /** Patch applied when the action terminally fails (recorded or fresh). */
  onFailure: (reason: string) => ParticipantPatch;
  onLimit?: (reason: string) => ParticipantPatch;
  /** Patch applied before rethrowing a retryable error for BullMQ to redeliver. */
  onRetryablePending?: () => ParticipantPatch;
  /**
   * Patch applied when dispatch ownership was lost mid-send. Return null to skip
   * the transition (the winner of the claim owns the outcome).
   */
  onOwnershipLost: () => ParticipantPatch | null;
  ambiguousReason: string;
  failureReason: string;
};

/**
 * Which per-account send ceiling a campaign action counts against. Keyed off
 * the Graph call the action's `send` actually makes: public_reply posts a
 * comment reply, opening_reply uses the comments-to-private-reply endpoint
 * (the one documented 750/hour limit), and everything else is an ordinary DM.
 */
function actionRateLimitBucket(action: string): SendRateLimitBucket {
  if (action === "public_reply") return "comment_reply";
  if (action === "opening_reply") return "private_reply";
  return "direct_message";
}

async function guardedDelivery(
  participant: AutomationParticipantRecord,
  spec: GuardedDeliverySpec,
  ctx: Pick<DeliveryContext, "client" | "connection" | "repository" | "finalAttempt" | "dispatchLeaseMs" | "timingObserver">,
): Promise<AutomationParticipantRecord> {
  const { repository } = ctx;
  for (; ;) {
    const prepared = await prepareDeliveryAction(
      participant,
      repository,
      spec.action,
      spec.externalEventId,
      ctx.dispatchLeaseMs,
    );

    if (prepared.kind === "in_flight") return currentParticipant(participant, repository);

    if (prepared.kind === "sent") {
      const invalidReason = spec.validateRecordedExecution?.(prepared.execution) ?? null;
      if (invalidReason) {
        const failed = await repository.transitionParticipant(
          participant.id,
          spec.allowedStates,
          spec.onFailure(invalidReason),
        );
        return failed ?? currentParticipant(participant, repository);
      }
      const updated = await repository.transitionParticipant(
        participant.id,
        spec.allowedStates,
        spec.onRecordedSent(prepared.execution),
      );
      return updated ?? currentParticipant(participant, repository);
    }

    if (prepared.kind === "failed") {
      const failed = await repository.transitionParticipant(
        participant.id,
        spec.allowedStates,
        spec.onFailure(prepared.reason),
      );
      return failed ?? currentParticipant(participant, repository);
    }

    // prepared.kind === "send": this worker owns the compatibility dispatch lease;
    // the shared ledger is authoritative for whether Meta may be called.
    const deliveryKey = deliveryKeys.campaignAction(participant.id, spec.action);
    const ledgerBefore = await repository.getOutboundDelivery(deliveryKey);
    const needsProviderAttempt = !ledgerBefore
      || ledgerBefore.state === "PENDING"
      || (ledgerBefore.state === "FAILED" && ledgerBefore.retryable);
    const reservation = needsProviderAttempt
      ? await reserveDailySendSlots({
        repository,
        automationId: participant.automationId,
        limit: spec.dailySendLimit,
      }, 1)
      : undefined;
    if (reservation && !reservation.allowed) {
      await releaseOwnedAction(participant, repository, spec.action, prepared.dispatchOwner);
      const reason = "daily_send_limit_reached";
      const limited = await repository.transitionParticipant(
        participant.id,
        spec.allowedStates,
        spec.onLimit?.(reason) ?? spec.onFailure(reason),
      );
      return limited ?? currentParticipant(participant, repository);
    }

    // Per-account send ceiling, checked only when Meta is actually about to be
    // called. Distinct from the daily send limit above, which is a product
    // setting: this one exists to keep the connected account under Meta's own
    // throttling. A reserved slot is given back and the dispatch lease
    // released so the participant is retried rather than spending its budget.
    if (needsProviderAttempt) {
      const rateLimit = await checkSendRateLimit(
        ctx.connection.igUserId,
        actionRateLimitBucket(spec.action),
      );
      if (!rateLimit.allowed) {
        if (reservation?.allowed) {
          await releaseDailySendSlots({ repository, automationId: participant.automationId }, reservation);
        }
        await releaseOwnedAction(participant, repository, spec.action, prepared.dispatchOwner);
        if (spec.onRetryablePending) {
          await repository.transitionParticipant(participant.id, spec.allowedStates, spec.onRetryablePending());
        }
        throw new MetaApiError("Send rate limit reached for this Instagram account", 429, true);
      }
    }

    let sentIds: { messageId?: string; recipientId?: string } = {};
    const delivery = await executeOutboundDelivery({
      deliveryKey,
      workspaceId: participant.workspaceId,
      automationId: participant.automationId,
      participantId: participant.id,
      instagramAccountId: participant.instagramAccountId,
      recipientId: participant.igScopedUserId,
      kind: "CAMPAIGN_ACTION",
      payload: spec.payload,
      claimLeaseMs: ctx.dispatchLeaseMs,
      repository,
      timingObserver: ctx.timingObserver,
    }, async (payload) => {
      sentIds = await spec.send(payload);
      return { id: sentIds.messageId };
    });

    if (
      reservation?.allowed
      && (delivery.status === "FAILED" || delivery.status === "BUSY"
        || (delivery.status === "SENT" && delivery.reused))
    ) {
      await releaseDailySendSlots(
        { repository, automationId: participant.automationId },
        reservation,
      );
    }

    if (delivery.status === "BUSY") {
      await releaseOwnedAction(participant, repository, spec.action, prepared.dispatchOwner);
      return currentParticipant(participant, repository);
    }
    if (delivery.status === "FAILED" && delivery.retryable && !ctx.finalAttempt) {
      await releaseOwnedAction(participant, repository, spec.action, prepared.dispatchOwner);
      if (spec.onRetryablePending) {
        await repository.transitionParticipant(participant.id, spec.allowedStates, spec.onRetryablePending());
      }
      throw new MetaApiError(delivery.error, 503, true);
    }
    if (delivery.status === "FAILED" || delivery.status === "UNKNOWN") {
      const reason = delivery.status === "UNKNOWN" ? spec.ambiguousReason : spec.failureReason;
      await completeOwnedAction(
        participant,
        repository,
        spec.action,
        prepared.dispatchOwner,
        "FAILED",
        undefined,
        reason,
      );
      const failed = await repository.transitionParticipant(
        participant.id,
        spec.allowedStates,
        spec.onFailure(reason),
      );
      return failed ?? currentParticipant(participant, repository);
    }

    if (delivery.reused) {
      sentIds = { messageId: delivery.providerMessageId };
    }
    const completed = await completeOwnedAction(
      participant,
      repository,
      spec.action,
      prepared.dispatchOwner,
      "SENT",
      sentIds.messageId,
      undefined,
      sentIds.recipientId,
    );
    if (!completed) {
      if (await getActionExecution(participant, repository, spec.action)) continue;
      const patch = spec.onOwnershipLost();
      if (!patch) return currentParticipant(participant, repository);
      const failed = await repository.transitionParticipant(participant.id, spec.allowedStates, patch);
      return failed ?? currentParticipant(participant, repository);
    }

    const updated = await repository.transitionParticipant(
      participant.id,
      spec.allowedStates,
      spec.onSuccess(sentIds),
    );
    return updated ?? currentParticipant(participant, repository);
  }
}

async function deliverPublicReply(
  participant: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  ctx: DeliveryContext,
): Promise<AutomationParticipantRecord> {
  const text = selectPublicReply(
    definition.publicReplies,
    participant.automationId,
    participant.sourceCommentId,
  );
  if (!text) {
    const skipped = await ctx.repository.transitionParticipant(
      participant.id,
      PARTICIPANT_ACTION_STATES,
      { publicReplyStatus: "SKIPPED" },
    );
    return skipped ?? participant;
  }

  return guardedDelivery(
    participant,
    {
      action: "public_reply",
      externalEventId: participant.sourceCommentId,
      payload: { commentId: participant.sourceCommentId, text },
      dailySendLimit: definition.dailySendLimit,
      allowedStates: PARTICIPANT_ACTION_STATES,
      send: async (payload) => ({
        messageId: (await ctx.client.replyToComment(
          ctx.connection,
          String(payload.commentId),
          String(payload.text),
        )).id,
      }),
      onRecordedSent: (execution) => ({
        publicReplyStatus: "SENT",
        publicReplyProviderId: execution.providerMessageId,
        publicReplySentAt: execution.createdAt,
        publicReplyError: undefined,
      }),
      onSuccess: (ids) => ({
        publicReplyStatus: "SENT",
        publicReplyProviderId: ids.messageId,
        publicReplySentAt: new Date().toISOString(),
        publicReplyError: undefined,
      }),
      onFailure: (reason) => ({ publicReplyStatus: "FAILED", publicReplyError: reason }),
      onLimit: (reason) => ({ publicReplyStatus: "SKIPPED", publicReplyError: reason }),
      onRetryablePending: () => ({
        publicReplyStatus: "PENDING",
        publicReplyError: "Meta public reply temporarily failed",
      }),
      onOwnershipLost: () => ({
        publicReplyStatus: "FAILED",
        publicReplyError: "Meta public reply dispatch ownership was lost",
      }),
      ambiguousReason: "Meta public reply outcome is ambiguous; delivery was not retried",
      failureReason: "Meta public reply failed",
    },
    ctx,
  );
}

async function deliverOpeningReply(
  participant: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  ctx: DeliveryContext,
): Promise<AutomationParticipantRecord> {
  const pickedOpening = pickVariant(definition.openingMessage.text, definition.openingMessage.textVariants);
  const openingText = renderTemplate(pickedOpening.text, {
    keyword: participant.matchedKeyword,
  });
  const openingMessage = {
    text: openingText,
    quickReply: {
      title: definition.openingMessage.optInButtonLabel,
      payload: createInteractionPayload(
        { participantId: participant.id, action: "opt_in" },
        ctx.interactionSecret,
      ),
    },
  };
  return guardedDelivery(
    participant,
    {
      action: "opening_reply",
      externalEventId: participant.sourceCommentId,
      payload: { commentId: participant.sourceCommentId, message: openingMessage },
      dailySendLimit: definition.dailySendLimit,
      allowedStates: ["COMMENT_MATCHED"],
      send: async (payload) => {
        const response = await ctx.client.sendPrivateReply(
          ctx.connection,
          String(payload.commentId),
          payload.message as { text: string; quickReply: { title: string; payload: string } },
        );
        if (!response.message_id || !response.recipient_id) {
          throw new Error("Meta accepted the opening reply without delivery identifiers");
        }
        return { messageId: response.message_id, recipientId: response.recipient_id };
      },
      onRecordedSent: (execution) => ({
        state: "OPENING_SENT",
        openingStatus: "SENT",
        openingProviderId: execution.providerMessageId,
        openingSentAt: execution.createdAt,
        openingError: undefined,
        igScopedUserId: execution.providerRecipientId,
        variantLabel: pickedOpening.label,
      }),
      validateRecordedExecution: (execution) =>
        !execution.providerMessageId || !execution.providerRecipientId
          ? "Recorded opening delivery success is missing provider identifiers"
          : null,
      onSuccess: (ids) => ({
        state: "OPENING_SENT",
        openingStatus: "SENT",
        openingProviderId: ids.messageId,
        openingSentAt: new Date().toISOString(),
        openingError: undefined,
        igScopedUserId: ids.recipientId,
        variantLabel: pickedOpening.label,
      }),
      onFailure: (reason) => ({ state: "FAILED", openingStatus: "FAILED", openingError: reason }),
      onLimit: (reason) => ({ openingStatus: "SKIPPED", openingError: reason }),
      onRetryablePending: () => ({
        openingStatus: "PENDING",
        openingError: "Meta opening reply temporarily failed",
      }),
      onOwnershipLost: () => ({
        state: "FAILED",
        openingStatus: "FAILED",
        openingError: "Meta opening reply dispatch ownership was lost",
      }),
      ambiguousReason: "Meta opening reply outcome is ambiguous; delivery was not retried",
      failureReason: "Meta opening reply failed",
    },
    ctx,
  );
}

async function promptForFollow(
  participant: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  event: NormalizedEvent,
  actionPurpose: "opt_in" | "recheck",
  ctx: DeliveryContext,
): Promise<AutomationParticipantRecord> {
  const followRequiredPatch = (): ParticipantPatch => ({
    state: "FOLLOW_REQUIRED",
    followStatus: false,
    followCheckedAt: new Date(event.timestamp).toISOString(),
    followCheckError: undefined,
    messagingWindowExpiresAt: new Date(event.timestamp + MESSAGING_WINDOW_MS).toISOString(),
    recheckCount: participant.recheckCount + (actionPurpose === "recheck" ? 1 : 0),
  });

  const followReply = {
    title: definition.followGate.recheckButtonLabel,
    payload: createInteractionPayload(
      { participantId: participant.id, action: "recheck" },
      ctx.interactionSecret,
      event.timestamp,
    ),
  };
  return guardedDelivery(
    participant,
    {
      action: `follow_prompt:${event.id}`,
      externalEventId: event.id,
      payload: {
        recipientId: event.recipientId!,
        text: definition.followGate.notFollowingMessage,
        reply: followReply,
      },
      dailySendLimit: definition.dailySendLimit,
      allowedStates: [participant.state],
      send: async (payload) => {
        const response = await ctx.client.sendQuickReply(
          ctx.connection,
          String(payload.recipientId),
          String(payload.text),
          payload.reply as { title: string; payload: string },
        );
        if (!response.message_id) {
          throw new Error("Meta accepted the follow prompt without a delivery identifier");
        }
        return { messageId: response.message_id };
      },
      onRecordedSent: () => followRequiredPatch(),
      onSuccess: () => followRequiredPatch(),
      onFailure: (reason) => ({ state: "FAILED", finalDeliveryError: reason }),
      onLimit: (reason) => ({ finalDeliveryStatus: "SKIPPED", finalDeliveryError: reason }),
      onRetryablePending: undefined,
      // The worker that wins the re-claim owns the follow-prompt outcome; no
      // terminal transition is forced here (matches historical behavior).
      onOwnershipLost: () => null,
      ambiguousReason: "Meta follow prompt outcome is ambiguous; delivery was not retried",
      failureReason: "Meta follow prompt failed",
    },
    ctx,
  );
}

const COOLDOWN_NOTICE_TEXT = "Give it a few more seconds, then tap the button below again.";

async function sendCooldownNotice(
  participant: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  event: NormalizedEvent,
  ctx: DeliveryContext,
): Promise<void> {
  const action = `cooldown_notice:${event.id}`;
  const prepared = await prepareDeliveryAction(
    participant,
    ctx.repository,
    action,
    event.id,
    ctx.dispatchLeaseMs,
  );
  if (prepared.kind !== "send") return;

  const providerStartedAt = performance.now();
  ctx.timingObserver?.providerStarted();
  try {
    const response = await ctx.client.sendQuickReply(
      ctx.connection,
      event.recipientId!,
      COOLDOWN_NOTICE_TEXT,
      {
        title: definition.followGate.recheckButtonLabel,
        payload: createInteractionPayload(
          { participantId: participant.id, action: "recheck" },
          ctx.interactionSecret,
          event.timestamp,
        ),
      },
    );
    if (!response.message_id) throw new Error("Meta accepted the cooldown notice without a delivery identifier");
    await completeOwnedAction(participant, ctx.repository, action, prepared.dispatchOwner, "SENT", response.message_id);
  } catch {
    await completeOwnedAction(participant, ctx.repository, action, prepared.dispatchOwner, "FAILED", undefined, "Meta cooldown notice failed");
  } finally {
    ctx.timingObserver?.providerFinished(performance.now() - providerStartedAt);
  }
}

async function deliverFinalMessage(
  verified: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  event: NormalizedEvent,
  ctx: DeliveryContext,
): Promise<AutomationParticipantRecord> {
  const deliveryText = renderTemplate(pickVariant(definition.delivery.text, definition.delivery.textVariants).text, {
    keyword: verified.matchedKeyword,
    post_link: verified.sourceMediaSnapshot?.permalink,
  });
  // Deliveries point at the click-tracking redirect so link performance is
  // measurable per participant; the redirect forwards to the real target.
  const deliveryUrl = trackedDeliveryUrl(verified.id, definition.delivery.url);
  const message: MetaMessage = definition.delivery.buttonLabel
    ? {
      type: "button",
      text: deliveryText,
      buttonLabel: definition.delivery.buttonLabel,
      url: deliveryUrl,
    }
    : { type: "link", text: deliveryText, url: deliveryUrl };

  return guardedDelivery(
    verified,
    {
      action: "final_delivery",
      externalEventId: event.id,
      payload: { recipientId: event.recipientId!, message },
      dailySendLimit: definition.dailySendLimit,
      allowedStates: ["FOLLOW_VERIFIED"],
      send: async (payload) => {
        const response = await ctx.client.sendDirectMessage(
          ctx.connection,
          String(payload.recipientId),
          payload.message as MetaMessage,
        );
        if (!response.message_id) {
          throw new Error("Meta accepted the final delivery without a delivery identifier");
        }
        return { messageId: response.message_id };
      },
      onRecordedSent: (execution) => ({
        state: "LINK_SENT",
        finalDeliveryStatus: "SENT",
        finalProviderId: execution.providerMessageId,
        finalDeliveredAt: execution.createdAt,
        finalDeliveryError: undefined,
      }),
      validateRecordedExecution: (execution) =>
        !execution.providerMessageId
          ? "Recorded final delivery success is missing provider identifier"
          : null,
      onSuccess: (ids) => ({
        state: "LINK_SENT",
        finalDeliveryStatus: "SENT",
        finalProviderId: ids.messageId,
        finalDeliveredAt: new Date().toISOString(),
        finalDeliveryError: undefined,
      }),
      onFailure: (reason) => ({
        state: "FAILED",
        finalDeliveryStatus: "FAILED",
        finalDeliveryError: reason,
      }),
      onLimit: (reason) => ({
        finalDeliveryStatus: "SKIPPED",
        finalDeliveryError: reason,
      }),
      onRetryablePending: () => ({
        finalDeliveryStatus: "PENDING",
        finalDeliveryError: "Meta final delivery temporarily failed",
      }),
      onOwnershipLost: () => ({
        state: "FAILED",
        finalDeliveryStatus: "FAILED",
        finalDeliveryError: "Meta final delivery dispatch ownership was lost",
      }),
      ambiguousReason: "Meta final delivery outcome is ambiguous; delivery was not retried",
      failureReason: "Meta final delivery failed",
    },
    ctx,
  );
}

async function verifyAndDeliver(
  participant: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  event: NormalizedEvent,
  ctx: DeliveryContext,
): Promise<AutomationParticipantRecord> {
  const verified = await ctx.repository.transitionParticipant(
    participant.id,
    [participant.state],
    {
      state: "FOLLOW_VERIFIED",
      followStatus: true,
      followCheckedAt: new Date(event.timestamp).toISOString(),
      followCheckError: undefined,
      messagingWindowExpiresAt: new Date(event.timestamp + MESSAGING_WINDOW_MS).toISOString(),
      finalDeliveryStatus: "PENDING",
    },
  );
  if (!verified) return currentParticipant(participant, ctx.repository);
  return deliverFinalMessage(verified, definition, event, ctx);
}

/** Opt-ins on ungated campaigns skip follower verification entirely. */
async function deliverWithoutFollowGate(
  participant: AutomationParticipantRecord,
  definition: FlowDefinitionV2,
  event: NormalizedEvent,
  ctx: DeliveryContext,
): Promise<AutomationParticipantRecord> {
  const verified = await ctx.repository.transitionParticipant(participant.id, ["OPTED_IN"], {
    state: "FOLLOW_VERIFIED",
    followStatus: true,
    followCheckedAt: new Date(event.timestamp).toISOString(),
    followCheckError: undefined,
    messagingWindowExpiresAt: new Date(event.timestamp + MESSAGING_WINDOW_MS).toISOString(),
    finalDeliveryStatus: "PENDING",
  });
  if (!verified) return currentParticipant(participant, ctx.repository);
  return deliverFinalMessage(verified, definition, event, ctx);
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

  const ctx: DeliveryContext = {
    client: options.client,
    connection: metaConnection(mapping.connection, options.tokenEncryptionKey),
    repository,
    interactionSecret: options.interactionSecret,
    finalAttempt: options.finalAttempt === true,
    dispatchLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DISPATCH_LEASE_MS,
    timingObserver: options.timingObserver,
  };

  if (participant.publicReplyStatus !== "SENT" && participant.publicReplyStatus !== "SKIPPED") {
    participant = await deliverPublicReply(participant, automation.definition, ctx);
  }
  if (participant.openingStatus !== "SENT" && participant.state !== "FAILED") {
    participant = await deliverOpeningReply(participant, automation.definition, ctx);
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

  if (!withinSchedule(campaign.definition.schedule, new Date(event.timestamp))) {
    return recordCampaignConfigurationResult(
      event,
      campaign,
      repository,
      "SKIPPED",
      "outside scheduled window",
    );
  }

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
    const resumed = await deliverFinalMessage(participant, definition, event, {
      client: options.client,
      connection: metaConnection(mapping.connection, options.tokenEncryptionKey),
      repository,
      interactionSecret: options.interactionSecret,
      finalAttempt: options.finalAttempt === true,
      dispatchLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DISPATCH_LEASE_MS,
      timingObserver: options.timingObserver,
    });
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
        messagingWindowExpiresAt: new Date(event.timestamp + MESSAGING_WINDOW_MS).toISOString(),
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
      if (options.client && options.tokenEncryptionKey) {
        await sendCooldownNotice(participant, definition, event, {
          client: options.client,
          connection: metaConnection(mapping.connection, options.tokenEncryptionKey),
          repository,
          interactionSecret: options.interactionSecret,
          finalAttempt: options.finalAttempt === true,
          dispatchLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DISPATCH_LEASE_MS,
          timingObserver: options.timingObserver,
        });
      }
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

  const ctx: DeliveryContext = {
    client: options.client,
    connection: metaConnection(mapping.connection, options.tokenEncryptionKey),
    repository,
    interactionSecret: options.interactionSecret,
    finalAttempt: options.finalAttempt === true,
    dispatchLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DISPATCH_LEASE_MS,
    timingObserver: options.timingObserver,
  };

  // Ungated campaigns deliver straight after the opt-in tap - no follower
  // verification call to Meta and no FOLLOW_REQUIRED detour.
  if (definition.followGate.required === false && payload.action === "opt_in") {
    if (!await actionClaim(participant, repository, "direct_delivery:opt_in", event.id)) {
      return { handled: true, result: handledResult(participant.id) };
    }
    let ungated: AutomationParticipantRecord;
    try {
      ungated = await deliverWithoutFollowGate(participant, definition, event, ctx);
    } catch (error) {
      await releaseAction(participant, repository, "direct_delivery:opt_in");
      throw error;
    }
    await completeAction(participant, repository, "direct_delivery:opt_in", "SENT");
    if (ungated.state === "LINK_SENT") {
      return { handled: true, result: handledResult(ungated.id, { sent: 1 }) };
    }
    if (ungated.state === "FAILED") {
      return { handled: true, result: handledResult(ungated.id, { failed: 1 }) };
    }
    return { handled: true, result: handledResult(ungated.id) };
  }

  if (!await actionClaim(participant, repository, followCheckAction, event.id)) {
    return { handled: true, result: handledResult(participant.id) };
  }

  let follows: boolean;
  try {
    const response = await options.client.getUserFollowStatus(ctx.connection, event.recipientId);
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
      updated = await verifyAndDeliver(participant, definition, event, ctx);
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
      updated = await promptForFollow(participant, definition, event, payload.action, ctx);
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
