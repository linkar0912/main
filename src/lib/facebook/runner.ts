import type { FacebookNormalizedEvent } from "./types";
import { createHash } from "node:crypto";
import { FacebookClient, FacebookApiError } from "./client";
import { unsealSecret } from "../security/secrets";
import { logger } from "../logger";
import { withinSchedule, type FlowDefinitionV1 } from "../automation/types";
import type { AutomationRecord, AutomationRepository, FacebookPageConnectionRecord } from "../repository";
import {
  reserveDailySendSlots,
  releaseDailySendSlots,
  type SendLimitReservation,
} from "../automation/send-limits";
import { findMatchedKeyword, matchesTrigger, resolveReplyForMedia } from "../automation/match";
import { validateDefinitionForTarget } from "../automation/channels/registry";
import type { DeliveryTimingObserver } from "../automation/delivery-timing";

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
};

const REPLY_CLAIM_LEASE_MS = 5 * 60 * 1_000;

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
  if (await repository.getWorkspaceStatus(mapping.workspaceId) !== "ACTIVE") {
    return { matched: 0, sent: 0, skipped: 0, failed: 0 };
  }

  // Persist a compact activity-inbox summary. Same idempotency contract as
  // the IG path: never throw, never block event processing.
  try {
    await repository.recordWebhookEvent(mapping.workspaceId, {
      providerEventId: event.id,
      eventType: "facebook.comment.created",
      receivedAt: new Date().toISOString(),
      payload: {
        pageId: event.pageId,
        postId: event.postId,
        commentId: event.commentId,
        ...(event.senderId ? { senderId: event.senderId } : {}),
        ...(event.senderName ? { senderName: event.senderName } : {}),
        text: (event.text ?? "").slice(0, 500),
      },
    });
  } catch (error) {
    logger.warn("Failed to persist Facebook webhook activity", {
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const automations = (await repository.listAutomationsForFacebookPage(mapping.workspaceId, event.pageId))
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
    if (await repository.hasExecution(mapping.workspaceId, dedupeKey)) {
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
      const providerStartedAt = performance.now();
      options.timingObserver?.providerStarted();
      let sendResult: Awaited<ReturnType<FacebookClient["postCommentReply"]>>;
      try {
        sendResult = await options.client.postCommentReply(connection, event.commentId, text);
      } finally {
        options.timingObserver?.providerFinished(performance.now() - providerStartedAt);
      }
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SENT",
        reason: `reply:${text.slice(0, 160)}`,
        ...(sendResult.id ? { providerMessageId: sendResult.id } : {}),
      });
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
      result.sent += 1;
    } catch (error) {
      if (error instanceof FacebookApiError && error.retryable) {
        await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
        throw retryableFacebookError(error);
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
