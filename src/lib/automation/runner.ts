import { evaluateFlow } from "./engine";
import type { EvaluationContext, ExecutionAction, NormalizedEvent } from "./types";
import { unsealSecret } from "../security/secrets";
import type { AutomationContactRecord, AutomationRepository, InstagramConnectionRecord } from "../repository";
import { MetaApiError } from "../meta/client";
import type { MetaConnection, MetaMessage } from "../meta/types";
import { notifyWorkspaceManagers } from "../notifications";
import type { OutboundEmail } from "../mailer";
import { logger } from "../logger";
import { enqueueLeadDelivery, type LeadDeliveryJob } from "../queue";
import {
  releaseDailySendSlots,
  reserveDailySendSlots,
  type SendLimitReservation,
} from "./send-limits";
import {
  processCampaignEvent,
  processExistingCampaignParticipant,
  processPendingCampaignInteraction,
  type CampaignRunnerClient,
  type CampaignRunnerOptions,
  type CampaignRunnerResult,
} from "./campaign-runner";
import {
  deliveryKeys,
  executeOutboundDelivery,
  type DeliveryExecutionResult,
} from "./outbound-delivery";
import { processLeadDelivery } from "./lead-delivery";

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

export class RetryableAutomationError extends Error {
  readonly retryable = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetryableAutomationError";
  }
}

export function isRetryableAutomationError(error: unknown): error is RetryableAutomationError {
  return error instanceof RetryableAutomationError;
}

function retryableAutomationError(error: unknown): RetryableAutomationError {
  if (isRetryableAutomationError(error)) return error;
  return new RetryableAutomationError(
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
}

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

const DEFAULT_DELIVERY_CLAIM_LEASE_MS = 30_000;
const DAILY_LIMIT_ERROR = "daily_send_limit_reached";

class DailySendLimitError extends Error {
  constructor() {
    super(DAILY_LIMIT_ERROR);
    this.name = "DailySendLimitError";
  }
}

async function executeActionDelivery(
  repository: AutomationRepository,
  request: {
    deliveryKey: string;
    workspaceId: string;
    automationId: string;
    instagramAccountId: string;
    recipientId?: string;
    kind: "CLASSIC_ACTION" | "EMAIL_CAPTURE";
    action: ExecutionAction;
    claimLeaseMs: number;
    dailySendLimit?: number;
  },
  client: AutomationRunnerClient,
  connection: MetaConnection,
): Promise<DeliveryExecutionResult> {
  const existing = await repository.getOutboundDelivery(request.deliveryKey);
  const needsProviderAttempt = !existing
    || existing.state === "PENDING"
    || (existing.state === "FAILED" && existing.retryable);
  let reservation: SendLimitReservation | undefined;
  if (needsProviderAttempt) {
    reservation = await reserveDailySendSlots({
      repository,
      automationId: request.automationId,
      limit: request.dailySendLimit,
    }, 1);
    if (!reservation.allowed) {
      return { status: "FAILED", retryable: false, error: DAILY_LIMIT_ERROR };
    }
  }

  try {
    const result = await executeOutboundDelivery({
      deliveryKey: request.deliveryKey,
      workspaceId: request.workspaceId,
      automationId: request.automationId,
      instagramAccountId: request.instagramAccountId,
      recipientId: request.recipientId,
      kind: request.kind,
      payload: { ...request.action },
      claimLeaseMs: request.claimLeaseMs,
      repository,
    }, async (payload) => ({
      id: await sendAction(client, connection, payload as ExecutionAction),
    }));
    if (
      reservation
      && (result.status === "FAILED" || result.status === "BUSY"
        || (result.status === "SENT" && result.reused))
    ) {
      await releaseDailySendSlots({ repository, automationId: request.automationId }, reservation);
    }
    return result;
  } catch (error) {
    if (reservation) {
      await releaseDailySendSlots({ repository, automationId: request.automationId }, reservation);
    }
    throw error;
  }
}

function requireSentDelivery(
  result: DeliveryExecutionResult,
  finalAttempt: boolean | undefined,
): string | undefined {
  if (result.status === "SENT") return result.providerMessageId;
  if (result.status === "FAILED" && result.error === DAILY_LIMIT_ERROR) {
    throw new DailySendLimitError();
  }
  if (result.status === "BUSY") {
    throw new MetaApiError("Outbound delivery is already in progress", 503, true);
  }
  if (result.status === "FAILED" && result.retryable && !finalAttempt) {
    throw new MetaApiError(result.error, 503, true);
  }
  throw new Error(result.error);
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

/**
 * Exact-match opt-out commands (case-insensitive). Deliberately conservative -
 * "stop" inside a longer sentence is a normal message, not an opt-out.
 */
const OPT_OUT_COMMANDS = new Set(["stop", "unsubscribe", "optout", "opt-out", "remove me", "stop messaging"]);

export function isOptOutCommand(text: string): boolean {
  return OPT_OUT_COMMANDS.has(text.trim().toLowerCase());
}

const OPT_OUT_CONFIRMATION = "Got it - you won't receive any more automated messages from us. 🙏";

/**
 * Builds the fulfillment email for a freshly captured lead. The link (if any) is
 * appended as its own plain-text line so it survives every mail client.
 */
function buildLeadDeliveryEmail(
  to: string,
  delivery: NonNullable<import("./types").FlowEmailCapture["delivery"]>,
): OutboundEmail {
  const lines = [delivery.message];
  if (delivery.linkUrl) {
    lines.push("", `${delivery.linkLabel ?? "Your link"}: ${delivery.linkUrl}`);
  }
  lines.push(
    "",
    `-\nYou're receiving this because you messaged our Instagram and requested it. To stop automated messages, reply STOP to our DM.`,
  );
  return { to, subject: delivery.subject, body: lines.join("\n") };
}

/**
 * Enrolls a freshly captured lead into every ACTIVE sequence that sources from the
 * automation which captured them. Idempotent per (sequence, contact); failures are
 * logged and never break the capture flow.
 */
async function enrollNewLeadInSequences(
  repository: AutomationRepository,
  mapping: WorkspaceMapping,
  accountId: string,
  sourceAutomationId: string,
  senderId: string,
): Promise<void> {
  try {
    const contact = await repository.getContact(mapping.workspaceId, accountId, senderId);
    if (!contact || contact.suppressedAt) return;
    const sequences = await repository.listActiveSequencesForSource(mapping.workspaceId, sourceAutomationId);
    for (const sequence of sequences) {
      const result = await repository.enrollContactInSequence(
        mapping.workspaceId,
        sequence.id,
        contact.id,
        sequence.steps[0]?.delayHours ?? 0,
        new Date().toISOString(),
      );
      if (result.created) {
        logger.info("Contact enrolled in sequence", {
          workspaceId: mapping.workspaceId,
          sequenceId: sequence.id,
          automationId: sourceAutomationId,
        });
      }
    }
  } catch (error) {
    logger.warn("Sequence enrollment failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
type WorkspaceMapping = NonNullable<Awaited<ReturnType<AutomationRepository["findWorkspaceByInstagramAccount"]>>>;

async function queueOrDeliverLead(
  repository: AutomationRepository,
  mapping: WorkspaceMapping,
  automationId: string,
  automationName: string,
  contactId: string,
  leadEmail: string,
  capturedAt: string,
  options: {
    delivery?: { subject: string; message: string; linkUrl?: string; linkLabel?: string };
    notifyUrl?: string;
    fields?: Record<string, string>;
  },
): Promise<void> {
  const jobs: LeadDeliveryJob[] = [];
  if (options.delivery) {
    const deliveryKey = deliveryKeys.lead(contactId, automationId, "email", "captured");
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: mapping.workspaceId,
      automationId,
      recipientId: leadEmail,
      kind: "LEAD_EMAIL",
      payload: buildLeadDeliveryEmail(leadEmail, options.delivery),
    });
    jobs.push({ deliveryKey, workspaceId: mapping.workspaceId, kind: "LEAD_EMAIL" });
  }
  if (options.notifyUrl) {
    const deliveryKey = deliveryKeys.lead(contactId, automationId, "webhook", "captured");
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: mapping.workspaceId,
      automationId,
      recipientId: leadEmail,
      kind: "LEAD_WEBHOOK",
      payload: {
        url: options.notifyUrl,
        body: {
          email: leadEmail,
          automationId,
          automationName,
          capturedAt,
          ...(options.fields ? { fields: options.fields } : {}),
        },
      },
    });
    jobs.push({ deliveryKey, workspaceId: mapping.workspaceId, kind: "LEAD_WEBHOOK" });
  }
  for (const job of jobs) {
    const queued = await enqueueLeadDelivery(job);
    if (queued) continue;
    const result = await processLeadDelivery(job, repository);
    if (result.status !== "SENT") {
      logger.warn("Lead delivery did not complete", {
        deliveryKey: job.deliveryKey,
        status: result.status,
        ...("error" in result ? { error: result.error } : {}),
      });
    }
  }
}

/**
 * Honors opt-outs before anything else runs: a STOP-style reply permanently
 * suppresses the sender (no automated send of any kind afterwards), clears any
 * pending email prompt, and gets one final confirmation. Returns the handled
 * result when the event was consumed by this phase.
 */
async function processOptOut(
  event: NormalizedEvent,
  mapping: WorkspaceMapping,
  repository: AutomationRepository,
  options: RunnerOptions,
): Promise<RunnerResult | null> {
  if (!event.recipientId) return null;
  const dmSideText = event.type === "message.received" || event.type === "quick_reply.received";
  const wantsOut = dmSideText && isOptOutCommand(event.text);
  if (!wantsOut) return null;

  const existing = await repository.getContact(mapping.workspaceId, event.accountId, event.recipientId);
  if (existing?.suppressedAt) return { matched: 0, sent: 0, skipped: 0, failed: 0 }; // already opted out - stay silent

  // First-ever interaction may be the opt-out itself; make sure a row exists.
  await repository.touchContact(mapping.workspaceId, event.accountId, event.recipientId, new Date(event.timestamp).toISOString());
  await repository.suppressContact(mapping.workspaceId, event.accountId, event.recipientId, new Date(event.timestamp).toISOString());

  if (options.client && options.tokenEncryptionKey) {
    try {
      const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
      await sendAction(options.client, connection, {
        type: "send_text",
        recipientId: event.recipientId,
        text: OPT_OUT_CONFIRMATION,
      });
    } catch (error) {
      // Suppression itself already persisted - never undo an opt-out over a failed send.
      logger.error("Opt-out confirmation DM failed", {
        accountId: event.accountId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info("Contact opted out", { workspaceId: mapping.workspaceId, accountId: event.accountId });
  return { matched: 1, sent: options.client ? 1 : 0, skipped: 0, failed: 0 };
}

/**
 * Intercepts DMs from people who are mid email capture: validates their reply, stores
 * the address, and confirms (or asks again within a small retry budget). Returns a
 * result when the event was fully handled by the capture flow - the normal automation
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
  if (!contact) return null;
  if (contact.state === "AWAITING_FIELD" && contact.awaitingAutomationId) {
    return processFieldAnswer(event, mapping, contact, repository, options);
  }
  if (contact.state !== "AWAITING_EMAIL" || !contact.awaitingAutomationId) return null;

  const automation = (await repository.listAutomations(mapping.workspaceId)).find(
    (item) => item.id === contact.awaitingAutomationId,
  );
  if (
    !automation
    || automation.status !== "ACTIVE"
    || automation.definition.version !== 1
    || !automation.definition.emailCapture
  ) {
    // The flow was deleted, paused, or its collector removed mid-conversation -
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

  let followUpDelivered = false;
  try {
    const candidate = extractEmailAddress(event.text);
    const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);

    if (candidate) {
      await repository.captureContactEmail(
        mapping.workspaceId,
        event.accountId,
        senderId,
        candidate,
        new Date(event.timestamp).toISOString(),
      );
      const fieldQueue = emailCapture.fields ?? [];
      if (fieldQueue.length > 0) {
        const delivery = await executeActionDelivery(repository, {
          deliveryKey: deliveryKeys.emailCapture(
            automation.id,
            event.id,
            `question:${fieldQueue[0].id}`,
          ),
          workspaceId: mapping.workspaceId,
          automationId: automation.id,
          instagramAccountId: event.accountId,
          recipientId: senderId,
          kind: "EMAIL_CAPTURE",
          action: { type: "send_text", recipientId: senderId, text: fieldQueue[0].question },
          claimLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
          dailySendLimit: automation.definition.dailySendLimit,
        }, options.client, connection);
        const providerMessageId = requireSentDelivery(delivery, options.finalAttempt);
        followUpDelivered = true;
        // Advance only after the question is durably SENT. A retry reuses the ledger
        // row and then performs this state transition without calling Meta again.
        await repository.beginContactFieldCollection(
          mapping.workspaceId,
          event.accountId,
          senderId,
          fieldQueue,
          automation.id,
          new Date(event.timestamp).toISOString(),
        );
        await repository.completeExecution(mapping.workspaceId, dedupeKey, {
          status: "SENT",
          reason: `email_captured:${candidate};field_asked:${fieldQueue[0].id}`,
          providerMessageId,
        });
        return { matched: 1, sent: 1, skipped: 0, failed: 0 };
      }
      const delivery = await executeActionDelivery(repository, {
        deliveryKey: deliveryKeys.emailCapture(automation.id, event.id, "confirmation"),
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        instagramAccountId: event.accountId,
        recipientId: senderId,
        kind: "EMAIL_CAPTURE",
        action: { type: "send_text", recipientId: senderId, text: emailCapture.confirmationText },
        claimLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
        dailySendLimit: automation.definition.dailySendLimit,
      }, options.client, connection);
      const providerMessageId = requireSentDelivery(delivery, options.finalAttempt);
      followUpDelivered = true;
      await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
      await queueOrDeliverLead(
        repository,
        mapping,
        automation.id,
        automation.name,
        contact.id,
        candidate,
        new Date(event.timestamp).toISOString(),
        { delivery: emailCapture.delivery, notifyUrl: emailCapture.notifyUrl },
      );
      await enrollNewLeadInSequences(repository, mapping, event.accountId, automation.id, senderId);
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

    const nextAttempt = contact.attempts + 1;
    if (nextAttempt > MAX_EMAIL_CAPTURE_RETRIES) {
      await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SKIPPED",
        reason: "email_capture_gave_up",
      });
      return { matched: 0, sent: 0, skipped: 1, failed: 0 };
    }

    const delivery = await executeActionDelivery(repository, {
      deliveryKey: deliveryKeys.emailCapture(automation.id, event.id, `retry:${nextAttempt}`),
      workspaceId: mapping.workspaceId,
      automationId: automation.id,
      instagramAccountId: event.accountId,
      recipientId: senderId,
      kind: "EMAIL_CAPTURE",
      action: {
        type: "send_text",
        recipientId: senderId,
        text: emailCapture.retryText ?? emailCapture.promptText,
      },
      claimLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
      dailySendLimit: automation.definition.dailySendLimit,
    }, options.client, connection);
    const providerMessageId = requireSentDelivery(delivery, options.finalAttempt);
    followUpDelivered = true;
    const attempts = await repository.bumpContactEmailAttempt(
      mapping.workspaceId,
      event.accountId,
      senderId,
    );
    await repository.completeExecution(mapping.workspaceId, dedupeKey, {
      status: "SENT",
      reason: `email_retry:${attempts}`,
      providerMessageId,
    });
    return { matched: 1, sent: 1, skipped: 0, failed: 0 };
  } catch (error) {
    if (error instanceof DailySendLimitError) {
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SKIPPED",
        reason: DAILY_LIMIT_ERROR,
      });
      return { matched: 1, sent: 0, skipped: 1, failed: 0 };
    }
    if (followUpDelivered) {
      await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
      throw retryableAutomationError(error);
    }
    if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) {
      await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
      throw retryableAutomationError(error);
    }
    await repository.completeExecution(mapping.workspaceId, dedupeKey, {
      status: "FAILED",
      reason: error instanceof Error ? error.message : "Meta delivery failed",
    });
    return { matched: 0, sent: 0, skipped: 0, failed: 1 };
  }
}

/**
 * Handles one conversational-field answer: stores it, asks the next question, and -
 * after the final answer - fires confirmation DM, fulfillment email, lead webhook,
 * sequence enrollment, and the owner notification. The lead is complete only here.
 */
async function processFieldAnswer(
  event: NormalizedEvent,
  mapping: WorkspaceMapping,
  contact: AutomationContactRecord,
  repository: AutomationRepository,
  options: RunnerOptions,
): Promise<RunnerResult> {
  const senderId = event.recipientId!;
  const automation = (await repository.listAutomations(mapping.workspaceId)).find(
    (item) => item.id === contact.awaitingAutomationId,
  );
  if (
    !automation
    || automation.status !== "ACTIVE"
    || automation.definition.version !== 1
    || !automation.definition.emailCapture
  ) {
    await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
    return { matched: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const emailCapture = automation.definition.emailCapture;
  const dedupeKey = `${automation.id}:${event.id}:field-answer`;
  if (await repository.hasExecution(mapping.workspaceId, dedupeKey)) return { matched: 0, sent: 0, skipped: 0, failed: 0 };

  const claimed = await repository.claimExecution({
    workspaceId: mapping.workspaceId,
    automationId: automation.id,
    externalEventId: event.id,
    dedupeKey,
  });
  if (!claimed) return { matched: 0, sent: 0, skipped: 0, failed: 0 };

  let followUpDelivered = false;
  try {
    const queue = contact.awaitingFields ?? [];
    const current = queue[0];
    const rest = queue.slice(1);
    if (!current) {
      await repository.clearContactAwaitingEmail(mapping.workspaceId, event.accountId, senderId);
      await repository.completeExecution(mapping.workspaceId, dedupeKey, { status: "SKIPPED", reason: "field_queue_empty" });
      return { matched: 0, sent: 0, skipped: 1, failed: 0 };
    }

    const answer = event.text.trim().slice(0, 200);
    const atIso = new Date().toISOString();

    if (!options.client || !options.tokenEncryptionKey) {
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SKIPPED",
        reason: "Meta delivery is disabled in demo mode",
      });
      return { matched: 1, sent: 0, skipped: 1, failed: 0 };
    }

    const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
    const outgoing = rest.length > 0 ? rest[0].question : emailCapture.confirmationText;
    const delivery = await executeActionDelivery(repository, {
      deliveryKey: deliveryKeys.emailCapture(
        automation.id,
        event.id,
        `field:${current.id}:${rest.length > 0 ? `question:${rest[0].id}` : "confirmation"}`,
      ),
      workspaceId: mapping.workspaceId,
      automationId: automation.id,
      instagramAccountId: event.accountId,
      recipientId: senderId,
      kind: "EMAIL_CAPTURE",
      action: { type: "send_text", recipientId: senderId, text: outgoing },
      claimLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
      dailySendLimit: automation.definition.dailySendLimit,
    }, options.client, connection);
    const providerMessageId = requireSentDelivery(delivery, options.finalAttempt);
    followUpDelivered = true;

    // Persist the answer transition only after the next prompt/confirmation is
    // durably SENT. If this write fails, the same event reuses SENT and retries it.
    const updated = await repository.recordContactFieldAnswer(
      mapping.workspaceId,
      event.accountId,
      senderId,
      current.id,
      answer,
      rest,
      atIso,
    );

    let completionReason = `field_answered:${current.id}`;
    if (updated.state === "CAPTURED") {
      completionReason = `lead_complete:${updated.email ?? "no-email"}`;
      if (updated.email) {
        await queueOrDeliverLead(
          repository,
          mapping,
          automation.id,
          automation.name,
          contact.id,
          updated.email,
          atIso,
          {
            delivery: emailCapture.delivery,
            notifyUrl: emailCapture.notifyUrl,
            fields: updated.fields ?? {},
          },
        );
      }
      await enrollNewLeadInSequences(repository, mapping, event.accountId, automation.id, senderId);
      void notifyWorkspaceManagers(
        mapping.workspaceId,
        `lead:email:${contact.id}`,
        "New lead captured",
        `${updated.email ?? senderId} completed “${automation.name}”${updated.fields ? ` (${Object.values(updated.fields).join(", ")})` : ""}.`,
      ).catch(() => undefined);
    }

    await repository.completeExecution(mapping.workspaceId, dedupeKey, {
      status: "SENT",
      reason: completionReason,
      providerMessageId,
    });
    return { matched: 1, sent: 1, skipped: 0, failed: 0 };
  } catch (error) {
    if (error instanceof DailySendLimitError) {
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SKIPPED",
        reason: DAILY_LIMIT_ERROR,
      });
      return { matched: 1, sent: 0, skipped: 1, failed: 0 };
    }
    if (followUpDelivered) {
      await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
      throw retryableAutomationError(error);
    }
    if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) {
      await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
      throw retryableAutomationError(error);
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

  // Opt-outs win over everything: a STOP-style reply permanently suppresses the
  // sender and is answered once. Suppressed senders are invisible to every engine
  // (classic, campaign, capture, comments) from here on.
  if (event.recipientId) {
    const optOut = await processOptOut(event, mapping, repository, options);
    if (optOut) return optOut;

    const contact = await repository.getContact(mapping.workspaceId, event.accountId, event.recipientId);
    if (contact?.suppressedAt) return { matched: 0, sent: 0, skipped: 0, failed: 0 };
  }

  // Email-capture conversations take precedence over everything else: a DM carrying
  // someone's email address must never also fire a keyword autoresponder or campaign.
  if (options.client && options.tokenEncryptionKey) {
    const captured = await processEmailCaptureReply(event, mapping, repository, options);
    if (captured) return captured;
  }

  // Contact registry touch - powers once-only first_contact greetings and email
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
    // Comment flows are excluded - they may only send a single private reply.
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
          // With conversational fields the follow-up is question 1, not the confirmation.
          const followUpText =
            automation.definition.emailCapture.fields?.[0]?.question
            ?? automation.definition.emailCapture.confirmationText;
          actionsToSend = [
            ...evaluation.actions,
            { type: "send_text", recipientId: senderId, text: followUpText },
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

    let allActionsDelivered = false;
    try {
      const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
      let providerMessageId: string | undefined;
      for (const [index, action] of actionsToSend.entries()) {
        const delivery = await executeActionDelivery(repository, {
          deliveryKey: deliveryKeys.classicAction(automation.id, event.id, index),
          workspaceId: mapping.workspaceId,
          automationId: automation.id,
          instagramAccountId: event.accountId,
          recipientId: event.recipientId,
          kind: "CLASSIC_ACTION",
          action,
          claimLeaseMs: options.dispatchLeaseMs ?? DEFAULT_DELIVERY_CLAIM_LEASE_MS,
          dailySendLimit: automation.definition.dailySendLimit,
        }, options.client, connection);
        providerMessageId = requireSentDelivery(delivery, options.finalAttempt) ?? providerMessageId;
      }
      allActionsDelivered = true;
      if (captureOutcome && senderId) {
        const atIso = new Date().toISOString();
        if (captureOutcome === "instant") {
          const capturedEmail = extractEmailAddress(event.text)!;
          await repository.captureContactEmail(
            mapping.workspaceId,
            event.accountId,
            senderId,
            capturedEmail,
            atIso,
          );
          const fieldQueue = automation.definition.emailCapture?.fields ?? [];
          if (fieldQueue.length > 0) {
            // Conversational form in progress - confirmation + fulfillment + enrollment
            // fire after the last answer (processFieldAnswer).
            //
            // The whole queue is stored, including the question just asked above as
            // `followUpText`, because processFieldAnswer treats queue[0] as the
            // outstanding question. Dropping it here filed the reply under the *next*
            // field's id and skipped that field - and with a single field it left an
            // empty queue that abandoned the lead as `field_queue_empty`.
            await repository.beginContactFieldCollection(
              mapping.workspaceId,
              event.accountId,
              senderId,
              fieldQueue,
              automation.id,
              atIso,
            );
          } else {
            await queueOrDeliverLead(
              repository,
              mapping,
              automation.id,
              automation.name,
              `${automation.id}:${senderId}`,
              capturedEmail,
              atIso,
              {
                delivery: automation.definition.emailCapture?.delivery,
                notifyUrl: automation.definition.emailCapture?.notifyUrl,
              },
            );
            await enrollNewLeadInSequences(repository, mapping, event.accountId, automation.id, senderId);
            void notifyWorkspaceManagers(
              mapping.workspaceId,
              `lead:email:${senderId}`,
              "New email captured",
              `An email was captured via your “${automation.name}” automation.`,
            ).catch(() => undefined);
          }
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
      if (error instanceof DailySendLimitError) {
        await repository.completeExecution(mapping.workspaceId, dedupeKey, {
          status: "SKIPPED",
          reason: DAILY_LIMIT_ERROR,
        });
        result.skipped += 1;
        continue;
      }
      if (allActionsDelivered) {
        await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
        throw retryableAutomationError(error);
      }
      if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) {
        await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
        throw retryableAutomationError(error);
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
