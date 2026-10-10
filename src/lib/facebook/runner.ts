import type { FacebookNormalizedEvent } from "./types";
import { createHash } from "node:crypto";
import { FacebookClient, FacebookApiError } from "./client";
import { unsealSecret } from "../security/secrets";
import { logger } from "../logger";
import { createId } from "../id";
import { notifyWorkspaceManagers } from "../notifications";
import { withinSchedule, type FlowDefinitionV1 } from "../automation/types";
import type { AutomationRecord, AutomationRepository, FacebookPageConnectionRecord } from "../repository";
import { isAbandonedExecutionClaim } from "../repository";
import {
  reserveDailySendSlots,
  releaseDailySendSlots,
  type SendLimitReservation,
} from "../automation/send-limits";
import { findMatchedKeyword, matchesTrigger, resolveReplyForMedia } from "../automation/match";
import { validateDefinitionForTarget } from "../automation/channels/registry";
import type { DeliveryTimingObserver } from "../automation/delivery-timing";
import { checkSendRateLimit } from "../automation/send-rate-limiter";
import { SendDeferredError } from "../automation/send-deferral";

/**
 * Result shape parallel to the Instagram runner's RunnerResult so the
 * webhook/worker plumbing can treat both channels uniformly.
 */
export type FacebookRunnerResult = {
  matched: number;
  sent: number;
  skipped: number;
  failed: number;
};

export type FacebookRunnerClient = FacebookClient;

export type FacebookRunnerOptions = {
  client?: FacebookClient;
  tokenEncryptionKey?: string;
  timingObserver?: DeliveryTimingObserver;
  /** Outbound-ledger claim lease for one public reply. */
  claimLeaseMs?: number;
};

const REPLY_CLAIM_LEASE_MS = 5 * 60 * 1_000;
const DEFAULT_DELIVERY_CLAIM_LEASE_MS = 30_000;

export class RetryableFacebookError extends Error {
  readonly retryable = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetryableFacebookError";
  }
}

export function isRetryableFacebookError(error: unknown): error is RetryableFacebookError {
  return error instanceof RetryableFacebookError;
}

function retryableFacebookError(error: unknown): RetryableFacebookError {
  if (error instanceof RetryableFacebookError) return error;
  return new RetryableFacebookError(
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
}

function pageConnection(page: FacebookPageConnectionRecord, key: string): { pageId: string; accessToken: string } {
  return { pageId: page.pageId, accessToken: unsealSecret(page.accessTokenEncrypted, key) };
}

/** Replace personalization tokens in a Facebook reply string. The set is
 * smaller than the Instagram version: Facebook only ships the comment author
 * name, not a dedicated handle, and the post id is a stable label, not a
 * caption. Unknown tokens are left untouched (same convention as IG). */
function buildTemplateVars(event: FacebookNormalizedEvent): Record<string, string> {
  return {
    username: event.senderName ?? "there",
    keyword: "",
    media: event.postId,
  };
}

function stableVariantIndex(key: string, length: number): number {
  const digest = createHash("sha256").update(key).digest();
  return digest.readUInt32BE(0) % length;
}

export function selectFacebookReplyText(definition: FlowDefinitionV1, commentId: string): string | null {
  const action = definition.actions.find((candidate) => candidate.type === "private_reply");
  if (!action || action.type !== "private_reply") return null;
  const replies = [action.text, ...(action.textVariants ?? [])].map((text) => text.trim()).filter(Boolean);
  return replies.length > 0 ? replies[stableVariantIndex(commentId, replies.length)]! : null;
}

function classifyFacebookFailure(error: unknown): string {
  if (!(error instanceof FacebookApiError)) return "facebook_delivery_failed";
  if (error.graphCode === 10 || error.graphCode === 200 || error.graphCode === 299 || error.status === 403) {
    return "permission_missing";
  }
  if (error.graphCode === 190 || error.status === 401) return "connection_unhealthy";
  return "facebook_api_error";
}

function renderFacebookText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(username|keyword|media)\}/g, (match, key: string) => vars[key] ?? "");
}

export function facebookReplyDeliveryKey(automationId: string, eventId: string): string {
  return `facebook:${automationId}:event:${eventId}:reply`;
}

/**
 * A rejection Meta answered with a retryable status - the comment was not
 * posted, so trying again is safe. A transport failure or an unreadable
 * response (status 0) is NOT: the public reply may already be live, and a
 * retry would post it twice.
 */
function isKnownNotPostedRetryable(error: unknown): error is FacebookApiError {
  return error instanceof FacebookApiError && error.retryable && error.responseReceived && error.status > 0;
}

type PublicReplyDelivery = { status: "SENT"; providerMessageId?: string } | { status: "UNKNOWN" };

/**
 * Posts the public reply through the outbound ledger so the same reply can
 * never be posted twice: a SENT row is reused on retry, an in-flight claim
 * defers to its holder, and an ambiguous provider outcome is recorded UNKNOWN
 * and never retried. Ledger rows only - Facebook replies are not metered
 * against the monthly delivery allowance, so no usage is reserved here.
 */
async function deliverPublicReply(
  repository: AutomationRepository,
  request: {
    deliveryKey: string;
    workspaceId: string;
    automationId: string;
    recipientId?: string;
    commentId: string;
    text: string;
    claimLeaseMs: number;
  },
  post: (text: string) => Promise<{ id?: string }>,
  timingObserver?: DeliveryTimingObserver,
): Promise<PublicReplyDelivery> {
  await repository.ensureOutboundDelivery({
    deliveryKey: request.deliveryKey,
    workspaceId: request.workspaceId,
    automationId: request.automationId,
    ...(request.recipientId ? { recipientId: request.recipientId } : {}),
    kind: "CLASSIC_ACTION",
    payload: { type: "facebook_comment_reply", commentId: request.commentId, text: request.text },
  });
  const owner = createId("delivery_claim");
  const claim = await repository.claimOutboundDelivery(
    request.deliveryKey,
    owner,
    new Date(Date.now() + request.claimLeaseMs).toISOString(),
  );
  if (!claim.claimed) {
    const record = claim.record;
    if (record.state === "SENT") return { status: "SENT", providerMessageId: record.providerMessageId };
    if (record.state === "UNKNOWN") return { status: "UNKNOWN" };
    if (record.state === "CLAIMED") throw new RetryableFacebookError("Facebook reply is already in progress");
    throw new Error(record.lastError ?? "facebook_delivery_failed");
  }

  const text = typeof claim.record.payload.text === "string" ? claim.record.payload.text : request.text;
  const providerStartedAt = performance.now();
  timingObserver?.providerStarted();
  let sendResult: { id?: string };
  try {
    sendResult = await post(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof FacebookApiError && error.responseReceived && error.status > 0) {
      const retryable = isKnownNotPostedRetryable(error);
      await repository.failOutboundDelivery(
        request.deliveryKey,
        owner,
        message,
        retryable,
        retryable ? "RETRYABLE_REJECTION" : "PROVIDER_REJECTED",
      ).catch(() => false);
      throw error;
    }
    await repository.markOutboundDeliveryUnknown(request.deliveryKey, owner, message).catch(() => false);
    return { status: "UNKNOWN" };
  } finally {
    timingObserver?.providerFinished(performance.now() - providerStartedAt);
  }
  const completed = await repository.completeOutboundDelivery(
    request.deliveryKey,
    owner,
    sendResult.id,
    new Date().toISOString(),
  ).catch(() => false);
  if (!completed) {
    // The reply is live but the ledger missed it; UNKNOWN keeps it from being posted again.
    await repository.markOutboundDeliveryUnknown(request.deliveryKey, owner, "Facebook accepted the reply but it could not be recorded").catch(() => false);
  }
  return { status: "SENT", providerMessageId: sendResult.id };
}

/** Graph code 190: the Page token is invalid. Stop using the Page and ask owners to reconnect. */
async function expireFacebookPage(
  repository: AutomationRepository,
  workspaceId: string,
  page: FacebookPageConnectionRecord,
): Promise<void> {
  try {
    await repository.updateFacebookPageStatus(page.id, "EXPIRED");
    await notifyWorkspaceManagers(
      workspaceId,
      `facebook-token-expired:${page.id}`,
      `Action needed: reconnect ${page.pageName}`,
      `The Facebook Page connection for ${page.pageName} expired, so its automations cannot reply right now. Reconnect the Page from Settings to resume.`,
    );
  } catch (error) {
    logger.warn("Could not mark Facebook Page expired", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Process a normalized Facebook Page feed event against the workspace's
 * pinned automations. v1 only supports comment triggers: a keyword match
 * causes a public reply, posted as a nested comment under the original.
 *
 * The runner mirrors the Instagram processNormalizedEvent's filtering order
 * (active status, channel-scoped to the page, priority sort, reply-once-per
 * check, schedule check) but does NOT share the IG engine - the action model
 * is intentionally tiny because Facebook comment-reply is a one-shot flow.
 */
export async function processNormalizedFacebookEvent(
  event: FacebookNormalizedEvent,
  repository: AutomationRepository,
  options: FacebookRunnerOptions = {},
): Promise<FacebookRunnerResult> {
  const mapping = await repository.findWorkspaceByFacebookPage(event.pageId);
  if (!mapping) return { matched: 0, sent: 0, skipped: 0, failed: 0 };
  // Status and the automation list are independent reads; fetch them together
  // so the first reply isn't queued behind two serial round trips.
  const [workspaceStatus, pageAutomations] = await Promise.all([
    repository.getWorkspaceStatus(mapping.workspaceId),
    repository.listAutomationsForFacebookPage(mapping.workspaceId, event.pageId),
  ]);
  if (workspaceStatus !== "ACTIVE") {
    return { matched: 0, sent: 0, skipped: 0, failed: 0 };
  }

  // Persist a compact activity-inbox summary. Same idempotency contract as
  // the IG path: never throw, never block event processing - the reply does
  // not wait on this write.
  void repository.recordWebhookEvent(mapping.workspaceId, {
    providerEventId: event.id,
    eventType: "facebook.comment.created",
    receivedAt: new Date().toISOString(),
    payload: {
      pageId: event.pageId,
      postId: event.postId,
      commentId: event.commentId,
      ...(event.senderId ? { senderId: event.senderId } : {}),
      ...(event.senderName ? { senderName: event.senderName } : {}),
      text: event.text ?? "",
        replayVersion: 1,
        timestamp: event.timestamp,
    },
  }).catch((error) => {
    logger.warn("Failed to persist Facebook webhook activity", {
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const automations = pageAutomations
    .filter(
      (automation) =>
        automation.status === "ACTIVE"
        && (automation.facebookPageId === undefined || automation.facebookPageId === event.pageId),
    )
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

  const result: FacebookRunnerResult = { matched: 0, sent: 0, skipped: 0, failed: 0 };
  let winnerSelected = false;

  for (const automation of automations) {
    const channelIssues = validateDefinitionForTarget(automation.definition, { provider: "FACEBOOK", surface: "COMMENT" });
    if (channelIssues.length > 0) {
      const invalidDedupeKey = `${automation.id}:${event.id}`;
      if (!(await repository.hasExecution(mapping.workspaceId, invalidDedupeKey))) {
        await repository.recordExecution({
          workspaceId: mapping.workspaceId,
          automationId: automation.id,
          externalEventId: event.id,
          dedupeKey: invalidDedupeKey,
          status: "FAILED",
          reason: "invalid_channel_definition",
        });
        result.failed += 1;
      }
      continue;
    }
    if (automation.definition.version !== 1) continue;
    const definition = automation.definition as FlowDefinitionV1;
    if (!matchesFacebookTrigger(definition, event)) continue;
    if (winnerSelected) continue;
    winnerSelected = true;

    result.matched += 1;
    const dedupeKey = `${automation.id}:${event.id}`;
    // Already handled - unless a worker died holding the claim, in which case
    // claimExecution below takes it over (the reply ledger prevents a repost).
    const existingExecution = await repository.getExecution(mapping.workspaceId, dedupeKey);
    if (existingExecution && !isAbandonedExecutionClaim(existingExecution)) {
      result.skipped += 1;
      continue;
    }
    if (!withinSchedule(definition.schedule, new Date(event.timestamp))) {
      await repository.recordExecution({
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        externalEventId: event.id,
        dedupeKey,
        status: "SKIPPED",
        reason: "outside scheduled window",
      });
      result.skipped += 1;
      continue;
    }

    // Per-Page send ceiling, checked before any claim or slot reservation so
    // there is nothing to unwind. Meta throttles Pages dynamically off
    // engagement, so a public reply storm on a viral post is a real
    // restriction risk. Deferred (not skipped, not failed) so the worker parks
    // the event until the window rolls over and the reply still lands, without
    // spending the job's few retry attempts.
    const rateLimit = await checkSendRateLimit(mapping.page.pageId, "comment_reply");
    if (!rateLimit.allowed) {
      throw new SendDeferredError("Send rate limit reached for this Facebook Page", rateLimit.retryAfterMs);
    }

    const replyOnce = definition.trigger.type === "comment"
      && definition.trigger.replyOncePerUser
      && event.senderId
      ? { pageId: event.pageId, senderId: event.senderId }
      : null;
    let replyRecipientClaimed = false;
    if (replyOnce) {
      const claimedAt = new Date();
      replyRecipientClaimed = await repository.claimFacebookReplyRecipient({
        automationId: automation.id,
        pageId: replyOnce.pageId,
        senderId: replyOnce.senderId,
        eventId: event.id,
        claimedAt: claimedAt.toISOString(),
        claimExpiresAt: new Date(claimedAt.getTime() + REPLY_CLAIM_LEASE_MS).toISOString(),
      });
      if (!replyRecipientClaimed) {
        await repository.recordExecution({
          workspaceId: mapping.workspaceId,
          automationId: automation.id,
          externalEventId: event.id,
          dedupeKey,
          status: "SKIPPED",
          reason: "replyOncePerUser is set and this sender already received a reply",
        });
        result.skipped += 1;
        continue;
      }
    }

    const reserved = await reserveSlots(repository, automation);
    if (!reserved.allowed) {
      if (replyOnce && replyRecipientClaimed) {
        await repository.releaseFacebookReplyRecipient(automation.id, replyOnce.pageId, replyOnce.senderId, event.id);
      }
      await repository.recordExecution({
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        externalEventId: event.id,
        dedupeKey,
        status: "SKIPPED",
        reason: "daily_send_limit",
      });
      result.skipped += 1;
      continue;
    }

    const claimed = await repository.claimExecution({
      workspaceId: mapping.workspaceId,
      automationId: automation.id,
      externalEventId: event.id,
      dedupeKey,
    });
    if (!claimed) {
      await releaseSlots(repository, automation.id, reserved);
      if (replyOnce && replyRecipientClaimed) {
        await repository.releaseFacebookReplyRecipient(automation.id, replyOnce.pageId, replyOnce.senderId, event.id);
      }
      result.skipped += 1;
      continue;
    }

    let sent = false;
    try {
      const trigger = definition.trigger.type === "comment" ? definition.trigger : null;
      const selectedReply = trigger ? resolveReplyForMedia(trigger, event.postId) ?? selectFacebookReplyText(definition, event.commentId) : null;
      if (!selectedReply) {
        await repository.completeExecution(mapping.workspaceId, dedupeKey, {
          status: "SKIPPED",
          reason: "no public reply configured",
        });
        result.skipped += 1;
        continue;
      }
      if (!options.client || !options.tokenEncryptionKey) {
        await repository.completeExecution(mapping.workspaceId, dedupeKey, {
          status: "SKIPPED",
          reason: "Facebook delivery is disabled in demo mode",
        });
        result.skipped += 1;
        continue;
      }
      const vars = buildTemplateVars(event);
      if (trigger?.match === "keyword") vars.keyword = findMatchedKeyword(event.text, trigger.keywords) ?? "";
      const text = renderFacebookText(selectedReply, vars);
      const connection = pageConnection(mapping.page, options.tokenEncryptionKey);
      const delivery = await deliverPublicReply(repository, {
        deliveryKey: facebookReplyDeliveryKey(automation.id, event.id),
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        ...(event.senderId ? { recipientId: event.senderId } : {}),
        commentId: event.commentId,
        text,
        claimLeaseMs: options.claimLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
      }, (payloadText) => options.client!.postCommentReply(connection, event.commentId, payloadText), options.timingObserver);

      if (delivery.status === "SENT") {
        await repository.completeExecution(mapping.workspaceId, dedupeKey, {
          status: "SENT",
          reason: `reply:${text.slice(0, 160)}`,
          ...(delivery.providerMessageId ? { providerMessageId: delivery.providerMessageId } : {}),
        });
      } else {
        // The reply may already be public: record the outcome and never post
        // it again. The slot and reply-once claim stay consumed as if sent.
        await repository.completeExecution(mapping.workspaceId, dedupeKey, {
          status: "FAILED",
          reason: "facebook_delivery_ambiguous",
        });
      }
      if (replyOnce) {
        await repository.completeFacebookReplyRecipient(
          automation.id,
          replyOnce.pageId,
          replyOnce.senderId,
          event.id,
          new Date().toISOString(),
        );
      }
      sent = true;
      if (delivery.status === "SENT") result.sent += 1;
      else result.failed += 1;
    } catch (error) {
      if (isKnownNotPostedRetryable(error)) {
        await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
        throw retryableFacebookError(error);
      }
      if (error instanceof FacebookApiError && error.graphCode === 190) {
        await expireFacebookPage(repository, mapping.workspaceId, mapping.page);
      }
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "FAILED",
        reason: classifyFacebookFailure(error),
      });
      result.failed += 1;
    } finally {
      if (!sent) {
        await releaseSlots(repository, automation.id, reserved);
        if (replyOnce && replyRecipientClaimed) {
          await repository.releaseFacebookReplyRecipient(automation.id, replyOnce.pageId, replyOnce.senderId, event.id);
        }
      }
    }
  }

  return result;
}

function matchesFacebookTrigger(definition: FlowDefinitionV1, event: FacebookNormalizedEvent): boolean {
  return matchesTrigger(definition, {
    id: event.id,
    accountId: event.pageId,
    type: "comment.created",
    text: event.text,
    commentId: event.commentId,
    mediaId: event.postId,
    senderUsername: event.senderName,
    timestamp: event.timestamp,
  });
}

async function reserveSlots(
  repository: AutomationRepository,
  automation: AutomationRecord,
): Promise<SendLimitReservation> {
  return reserveDailySendSlots(
    { automationId: automation.id, repository, limit: automation.definition.dailySendLimit },
    1,
  );
}

async function releaseSlots(
  repository: AutomationRepository,
  automationId: string,
  reservation: SendLimitReservation,
): Promise<void> {
  await releaseDailySendSlots(
    { automationId, repository },
    reservation,
  );
}
