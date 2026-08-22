import { evaluateFlow } from "./engine";
import type { EvaluationContext, ExecutionAction, NormalizedEvent } from "./types";
import { unsealSecret } from "../security/secrets";
import type { AutomationRepository, InstagramConnectionRecord } from "../repository";
import { MetaApiError } from "../meta/client";
import type { MetaConnection, MetaMessage } from "../meta/types";
import { notifyWorkspaceManagers } from "../notifications";
import { checkDailySendLimit } from "./send-limits";
import {
  processCampaignEvent,
  processExistingCampaignParticipant,
  processPendingCampaignInteraction,
  type CampaignRunnerClient,
  type CampaignRunnerOptions,
  type CampaignRunnerResult,
} from "./campaign-runner";

export type AutomationRunnerClient = CampaignRunnerClient;

export type RunnerOptions = CampaignRunnerOptions & {
  campaignsEnabled?: boolean;
};

export type RunnerResult = {
  matched: number;
  sent: number;
  skipped: number;
  failed: number;
};

function metaConnection(connection: InstagramConnectionRecord, tokenEncryptionKey: string): MetaConnection {
  return {
    igUserId: connection.igUserId,
    accessToken: unsealSecret(connection.accessTokenEncrypted, tokenEncryptionKey),
  };
}

async function sendAction(
  client: AutomationRunnerClient,
  connection: MetaConnection,
  action: ExecutionAction,
): Promise<string | undefined> {
  if (action.type === "private_reply") {
    return (await client.sendPrivateReply(connection, action.commentId, action.text)).message_id;
  }

  const message: MetaMessage =
    action.type === "send_text"
      ? { type: "text", text: action.text }
      : action.type === "send_link"
        ? { type: "link", text: action.text, url: action.url }
        : { type: "button", text: action.text, buttonLabel: action.buttonLabel, url: action.url };

  return (await client.sendDirectMessage(connection, action.recipientId, message)).message_id;
}

/** Inbound events that represent a person reaching out on the DM side of the account. */
const CONTACT_TOUCH_EVENT_TYPES: NormalizedEvent["type"][] = [
  "message.received",
  "quick_reply.received",
  "postback.received",
  "optin.received",
  "referral.received",
  "story_mention.received",
];

/**
 * Invalid email replies tolerated before the collector stops asking: one prompt plus
 * this many retries keeps the exchange polite without looping forever.
 */
const MAX_EMAIL_CAPTURE_RETRIES = 2;

/** Pragmatic email shape: local@domain.tld, extracted out of freeform DM text. */
export function extractEmailAddress(text: string): string | undefined {
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  if (!match || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(match)) return undefined;
  return match.toLowerCase();
}

type WorkspaceMapping = NonNullable<Awaited<ReturnType<AutomationRepository["findWorkspaceByInstagramAccount"]>>>;

/**
 * Intercepts DMs from people who are mid email capture: validates their reply, stores
 * the address, and confirms (or asks again within a small retry budget). Returns a
 * result when the event was fully handled by the capture flow — the normal automation
 * loop must not also fire on the same message.
 */
async function processEmailCaptureReply(
  event: NormalizedEvent,
  mapping: WorkspaceMapping,
  repository: AutomationRepository,
  options: RunnerOptions,
): Promise<RunnerResult | null> {
  if (!options.client || !options.tokenEncryptionKey) return null;
  if (event.type !== "message.received" && event.type !== "quick_reply.received") return null;
  if (!event.recipientId) return null;
  const senderId = event.recipientId;

  const contact = await repository.getContact(mapping.workspaceId, event.accountId, senderId);
  if (!contact || contact.state !== "AWAITING_EMAIL" || !contact.awaitingAutomationId) return null;

  const automation = (await repository.listAutomations(mapping.workspaceId)).find(
    (item) => item.id === contact.awaitingAutomationId,
  );
  if (
    !automation
    || automation.status !== "ACTIVE"
    || automation.definition.version !== 1
    || !automation.definition.emailCapture
  ) {
    // The flow was deleted, paused, or its collector removed mid-conversation —
    // stop asking instead of leaving the person stuck in a prompt loop.
    await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
    return null;
  }

  const emailCapture = automation.definition.emailCapture;
  const dedupeKey = `${automation.id}:${event.id}:email-reply`;
  if (await repository.hasExecution(mapping.workspaceId, dedupeKey)) return null;

  const claimed = await repository.claimExecution({
    workspaceId: mapping.workspaceId,
    automationId: automation.id,
    externalEventId: event.id,
    dedupeKey,
  });
  if (!claimed) return null;

  try {
    const candidate = extractEmailAddress(event.text);
    const dailyLimit = await checkDailySendLimit(automation.definition, {
      workspaceId: mapping.workspaceId,
      automationId: automation.id,
    });
    if (!dailyLimit.allowed) {
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SKIPPED",
        reason: dailyLimit.reason,
      });
      // When an address arrived we still store it — only the confirmation DM waits.
      if (candidate) {
        await repository.captureContactEmail(
          mapping.workspaceId,
          event.accountId,
          senderId,
          candidate,
          new Date(event.timestamp).toISOString(),
        );
        return { matched: 1, sent: 0, skipped: 1, failed: 0 };
      }
      return { matched: 0, sent: 0, skipped: 1, failed: 0 };
    }

    const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);

    if (candidate) {
      await repository.captureContactEmail(
        mapping.workspaceId,
        event.accountId,
        senderId,
        candidate,
        new Date(event.timestamp).toISOString(),
      );
      const providerMessageId = await sendAction(options.client, connection, {
        type: "send_text",
        recipientId: senderId,
        text: emailCapture.confirmationText,
      });
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SENT",
        reason: `email_captured:${candidate}`,
        providerMessageId,
      });
      void notifyWorkspaceManagers(
        mapping.workspaceId,
        `lead:email:${contact.id}`,
        "New email captured",
        `${candidate} shared their email with your “${automation.name}” automation.`,
      ).catch(() => undefined);
      return { matched: 1, sent: 1, skipped: 0, failed: 0 };
    }

    const attempts = await repository.bumpContactEmailAttempt(mapping.workspaceId, event.accountId, senderId);
    if (attempts > MAX_EMAIL_CAPTURE_RETRIES) {
      await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SKIPPED",
        reason: "email_capture_gave_up",
      });
      return { matched: 0, sent: 0, skipped: 1, failed: 0 };
    }

    const providerMessageId = await sendAction(options.client, connection, {
      type: "send_text",
      recipientId: senderId,
      text: emailCapture.retryText ?? emailCapture.promptText,
    });
    await repository.completeExecution(mapping.workspaceId, dedupeKey, {
      status: "SENT",
      reason: `email_retry:${attempts}`,
      providerMessageId,
    });
    return { matched: 1, sent: 1, skipped: 0, failed: 0 };
  } catch (error) {
    if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) {
      await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
      throw error;
    }
    await repository.completeExecution(mapping.workspaceId, dedupeKey, {
      status: "FAILED",
      reason: error instanceof Error ? error.message : "Meta delivery failed",
    });
    return { matched: 0, sent: 0, skipped: 0, failed: 1 };
  }
}

export async function processNormalizedEvent(
  event: NormalizedEvent,
  repository: AutomationRepository,
  options: RunnerOptions = {},
): Promise<RunnerResult | CampaignRunnerResult> {
  const mapping = await repository.findWorkspaceByInstagramAccount(event.accountId);
  if (!mapping) return { matched: 0, sent: 0, skipped: 0, failed: 0 };

  const automations = (await repository.listAutomations(mapping.workspaceId)).filter(
    (automation) => automation.status === "ACTIVE",
  );

  // Email-capture conversations take precedence over everything else: a DM carrying
  // someone's email address must never also fire a keyword autoresponder or campaign.
  if (options.client && options.tokenEncryptionKey) {
    const captured = await processEmailCaptureReply(event, mapping, repository, options);
    if (captured) return captured;
  }

  // Contact registry touch — powers once-only first_contact greetings and email
  // collection. Maintained only when an active classic flow actually needs it, so
  // casual workspaces don't accumulate sender records they never use.
  let evaluationContext: EvaluationContext = {};
  const needsContactTracking = automations.some(
    (automation) =>
      automation.definition.version === 1
      && (automation.definition.trigger.type === "first_contact" || Boolean(automation.definition.emailCapture)),
  );
  if (needsContactTracking && event.recipientId && CONTACT_TOUCH_EVENT_TYPES.includes(event.type)) {
    const touch = await repository.touchContact(
      mapping.workspaceId,
      event.accountId,
      event.recipientId,
      new Date(event.timestamp).toISOString(),
    );
    evaluationContext = { isNewContact: touch.created };
  }

  if (options.campaignsEnabled === true) {
    const interaction = await processPendingCampaignInteraction(
      event,
      mapping,
      repository,
      options,
    );
    if (interaction.handled) return interaction.result;

    if (event.type === "comment.created" && event.commentId) {
      const participant = await repository.findParticipantBySource(
        mapping.workspaceId,
        event.accountId,
        event.commentId,
      );
      if (participant) {
        return processExistingCampaignParticipant(participant, mapping, repository, options);
      }
    }

    for (const campaign of automations) {
      if (campaign.definition.version !== 2) continue;
      const campaignResult = await processCampaignEvent(
        event,
        campaign,
        mapping,
        repository,
        options,
      );
      if (campaignResult.handled) return campaignResult;
    }
  }

  const result: RunnerResult = { matched: 0, sent: 0, skipped: 0, failed: 0 };

  for (const automation of automations) {
    if (automation.definition.version !== 1) continue;

    const dedupeKey = `${automation.id}:${event.id}`;
    if (await repository.hasExecution(mapping.workspaceId, dedupeKey)) continue;

    const evaluation = evaluateFlow(automation.definition, event, evaluationContext);
    if (evaluation.status === "skipped") {
      await repository.recordExecution({
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        externalEventId: event.id,
        dedupeKey,
        status: "SKIPPED",
        reason: evaluation.reason,
      });
      result.skipped += 1;
      continue;
    }

    result.matched += 1;
    if (!options.client) {
      await repository.recordExecution({
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        externalEventId: event.id,
        dedupeKey,
        status: "SKIPPED",
        reason: "Meta delivery is disabled in demo mode",
      });
      result.skipped += 1;
      continue;
    }

    const dailyLimit = await checkDailySendLimit(automation.definition, {
      workspaceId: mapping.workspaceId,
      automationId: automation.id,
    });
    if (!dailyLimit.allowed) {
      void notifyWorkspaceManagers(
        mapping.workspaceId,
        `limit:daily:${automation.id}:${new Date().toISOString().slice(0, 10)}`,
        `Automation paused: daily send limit reached`,
        `Your automation hit its daily send cap (${dailyLimit.reason}). It will resume automatically tomorrow, or raise the cap in the builder.`,
      ).catch(() => undefined);
      await repository.recordExecution({
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        externalEventId: event.id,
        dedupeKey,
        status: "SKIPPED",
        reason: dailyLimit.reason,
      });
      result.skipped += 1;
      continue;
    }

    if (!options.tokenEncryptionKey) {
      await repository.recordExecution({
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        externalEventId: event.id,
        dedupeKey,
        status: "FAILED",
        reason: "Token encryption key is not configured",
      });
      result.failed += 1;
      continue;
    }

    const claimed = await repository.claimExecution({
      workspaceId: mapping.workspaceId,
      automationId: automation.id,
      externalEventId: event.id,
      dedupeKey,
    });
    if (!claimed) continue;

    // Email-collection follow-up: append the prompt (or, when the triggering message
    // already contains an address, the confirmation) after this flow's own actions.
    // Comment flows are excluded — they may only send a single private reply.
    let actionsToSend: ExecutionAction[] = evaluation.actions;
    let captureOutcome: "prompt" | "instant" | null = null;
    const senderId = event.recipientId;
    if (
      automation.definition.emailCapture
      && automation.definition.trigger.type !== "comment"
      && senderId
    ) {
      const contact = await repository.getContact(mapping.workspaceId, event.accountId, senderId);
      if (!contact?.email) {
        const embeddedEmail = extractEmailAddress(event.text);
        if (embeddedEmail) {
          captureOutcome = "instant";
          actionsToSend = [
            ...evaluation.actions,
            { type: "send_text", recipientId: senderId, text: automation.definition.emailCapture.confirmationText },
          ];
        } else {
          captureOutcome = "prompt";
          actionsToSend = [
            ...evaluation.actions,
            { type: "send_text", recipientId: senderId, text: automation.definition.emailCapture.promptText },
          ];
        }
      }
    }

    try {
      const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
      let providerMessageId: string | undefined;
      for (const action of actionsToSend) {
        providerMessageId = (await sendAction(options.client, connection, action)) ?? providerMessageId;
      }
      if (captureOutcome && senderId) {
        const atIso = new Date().toISOString();
        if (captureOutcome === "instant") {
          await repository.captureContactEmail(
            mapping.workspaceId,
            event.accountId,
            senderId,
            extractEmailAddress(event.text)!,
            atIso,
          );
          void notifyWorkspaceManagers(
            mapping.workspaceId,
            `lead:email:${senderId}`,
            "New email captured",
            `An email was captured via your “${automation.name}” automation.`,
          ).catch(() => undefined);
        } else {
          await repository.setContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId, automation.id, atIso);
        }
      }
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SENT",
        providerMessageId,
      });
      result.sent += 1;
    } catch (error) {
      if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) {
        await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
        throw error;
      }
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "FAILED",
        reason: error instanceof Error ? error.message : "Meta delivery failed",
      });
      result.failed += 1;
    }
  }

  return result;
}
