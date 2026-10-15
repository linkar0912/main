import { createId } from "../id";
import { logger } from "../logger";
import { MetaApiError } from "../meta/client";
import {
  ACCOUNT_RECOVERING_REASON,
  ACCOUNT_THROTTLED_REASON,
  isMetaAccountBlock,
  isMetaRateLimit,
} from "../meta/errors";
import { notifyWorkspaceManagers } from "../notifications";
import { getRepository } from "../repository-provider";
import type {
  AutomationRepository,
  EnsureOutboundDeliveryInput,
  OutboundDeliveryKind,
  OutboundDeliveryRecord,
} from "../repository";
import {
  checkAccountSendGate,
  heldSendReason,
  pauseAccountAfterBlock,
  recordAccountThrottle,
  THROTTLE_BACKOFF_MS,
  throttleBackoffMs,
  type AccountSendGate,
  type RecoveryBudgetMode,
  type SendPauseTarget,
} from "./account-pause";
import type { DeliveryTimingObserver } from "./delivery-timing";
import { SendDeferredError } from "./send-deferral";

export type ProviderFailureClass =
  | "KNOWN_RETRYABLE"
  | "KNOWN_PERMANENT"
  | "AMBIGUOUS";

export type DeliveryExecutionRequest<
  TPayload extends Record<string, unknown>,
> = EnsureOutboundDeliveryInput & {
  payload: TPayload;
  claimLeaseMs: number;
  repository?: AutomationRepository;
  timingObserver?: DeliveryTimingObserver;
  /** Treat network-level failures as retryable instead of UNKNOWN (lead webhooks). */
  networkFailuresAreRetryable?: boolean;
  entitlementService?: {
    getMonthlyDeliveryLimit(workspaceId: string): Promise<number | null>;
  };
};

export type DeliveryExecutionResult =
  | { status: "SENT"; providerMessageId?: string; reused: boolean; deliveryId?: string }
  // `reused` marks an outcome some earlier attempt already recorded, so a
  // caller keeping per-outcome counters can tell it apart from a fresh one.
  // QUOTA_REJECTED: the plan's monthly allowance. ACCOUNT_PAUSED: Meta
  // limited the account, so Linkar held the send without calling Meta.
  | { status: "FAILED"; retryable: boolean; error: string; reason?: "QUOTA_REJECTED" | "ACCOUNT_PAUSED"; reused?: true }
  | { status: "UNKNOWN"; error: string; reused?: true }
  | { status: "BUSY" };

export const deliveryKeys = {
  classicAction: (automationId: string, eventId: string, index: number) =>
    `automation:${automationId}:event:${eventId}:action:${index}`,
  emailCapture: (automationId: string, eventId: string, stage: string) =>
    `automation:${automationId}:event:${eventId}:capture:${stage}`,
  campaignAction: (participantId: string, action: string) =>
    `campaign:${participantId}:action:${action}`,
  sequenceStep: (enrollmentId: string, stepId: string) =>
    `sequence:${enrollmentId}:step:${stepId}`,
  broadcastRecipient: (broadcastId: string, accountId: string, recipientId: string) =>
    `broadcast:${broadcastId}:${accountId}:${recipientId}`,
  lead: (
    contactId: string,
    automationId: string,
    channel: "email" | "webhook",
    stage: string,
  ) => `lead:${contactId}:automation:${automationId}:${channel}:${stage}`,
  followUp: (automationId: string, eventId: string, index: number) =>
    `automation:${automationId}:event:${eventId}:followup:${index}`,
};

/**
 * What Meta's rejection says about the whole account, not just this send: an
 * account-level block (368 / #2022) or a request to slow down (throttling).
 */
export type ProviderAccountSignal = "account_blocked" | "rate_limited" | null;

export function providerAccountSignal(error: unknown): ProviderAccountSignal {
  // A deferral is Linkar's own wait (it also carries status 429), never Meta's answer.
  if (!(error instanceof MetaApiError) || error instanceof SendDeferredError) return null;
  if (!error.responseReceived || error.status === 0) return null;
  if (isMetaAccountBlock({ code: error.code, subcode: error.subcode, message: error.message })) return "account_blocked";
  if (isMetaRateLimit({ status: error.status, code: error.code })) return "rate_limited";
  return null;
}

export function classifyProviderFailure(
  error: unknown,
  networkFailuresAreRetryable = false,
): ProviderFailureClass {
  if (
    !(error instanceof MetaApiError)
    || !error.responseReceived
    || error.status === 0
  ) return networkFailuresAreRetryable ? "KNOWN_RETRYABLE" : "AMBIGUOUS";
  const signal = providerAccountSignal(error);
  // Retrying into a block only adds refused attempts to the account's record.
  if (signal === "account_blocked") return "KNOWN_PERMANENT";
  // Meta reports throttling (Graph codes 4/17/32/613/80002/80006) and other
  // transient errors as HTTP 400 - a rejection we know was not delivered and
  // may safely try again later, once the account has cooled down.
  if (signal === "rate_limited" || error.retryable || error.status === 408 || error.status === 429 || error.status >= 500) {
    return "KNOWN_RETRYABLE";
  }
  return "KNOWN_PERMANENT";
}

/** Lead emails and lead webhooks never reach Meta, so an account pause does not hold them. */
const NON_META_KINDS: ReadonlySet<OutboundDeliveryKind> = new Set(["LEAD_EMAIL", "LEAD_WEBHOOK"]);

/**
 * Kinds whose callers already treat a thrown SendDeferredError as "park this
 * queue job" after releasing every claim they hold, exactly as for the hourly
 * send ceiling. A cool-down then waits without spending a retry. Campaign
 * actions hold a dispatch lease a throw would orphan, sequence steps run in a
 * sweep and manual replies in a web request, so those get a retryable
 * failure instead and keep their own retry timing.
 */
const DEFERRABLE_KINDS: ReadonlySet<OutboundDeliveryKind> = new Set([
  "CLASSIC_ACTION",
  "EMAIL_CAPTURE",
  "BROADCAST_RECIPIENT",
  "FLOW_FOLLOWUP",
]);

/**
 * How each kind treats the reduced budget after a block pause. A teammate's
 * typed reply is neither limited by it nor uses it. Campaign actions use it
 * but are never held by it: campaign-runner turns a retryable failure into a
 * failed DM after a few job retries, so holding them for up to an hour would
 * drop the comment-to-DM replies instead of delaying them.
 */
function recoveryModeFor(kind: OutboundDeliveryKind): RecoveryBudgetMode {
  if (kind === "MANUAL_INBOX") return "ignore";
  if (kind === "CAMPAIGN_ACTION") return "count";
  return "enforce";
}

/**
 * Sequence steps wait out a block pause instead of being recorded as not
 * sent: sequence-runner ends the whole enrollment on a final failure, but
 * backs a retryable one off and tries again on a later sweep (which still
 * re-checks the messaging window before sending).
 */
const WAIT_OUT_BLOCK_KINDS: ReadonlySet<OutboundDeliveryKind> = new Set(["SEQUENCE_STEP"]);

function pauseTargetFor(request: EnsureOutboundDeliveryInput): SendPauseTarget | null {
  if (!request.instagramAccountId || NON_META_KINDS.has(request.kind)) return null;
  return { channel: "instagram", accountId: request.instagramAccountId };
}

/** Holds a send during a throttle cool-down or the reduced post-pause budget. */
function holdForCoolDown(
  kind: OutboundDeliveryKind,
  gate: Extract<AccountSendGate, { status: "throttled" | "recovering" }>,
): DeliveryExecutionResult {
  const waitMs = gate.status === "throttled" ? gate.until - Date.now() : gate.retryAfterMs;
  const reason = gate.status === "throttled" ? ACCOUNT_THROTTLED_REASON : ACCOUNT_RECOVERING_REASON;
  if (DEFERRABLE_KINDS.has(kind)) throw new SendDeferredError(reason, waitMs);
  return { status: "FAILED", retryable: true, error: reason };
}

/** Graph code 190: the access token is invalid, expired or revoked. */
export function isInvalidTokenError(error: unknown): boolean {
  return error instanceof MetaApiError && error.responseReceived && error.code === 190;
}

/**
 * A send rejected with code 190 means every later send on this connection will
 * fail the same way. Mark the connection EXPIRED (which also stops new events
 * from being processed for it) and tell the owners to reconnect, exactly as
 * the token refresher does. Never throws - alerting must not break delivery.
 */
async function expireInvalidInstagramConnection(
  repository: AutomationRepository,
  igUserId: string,
): Promise<void> {
  try {
    const mapping = await repository.findWorkspaceByInstagramAccount(igUserId);
    if (!mapping) return;
    await repository.updateConnectionStatus(mapping.connection.id, "EXPIRED");
    logger.warn("Instagram connection marked expired after an invalid-token send", {
      workspaceId: mapping.workspaceId,
      connectionId: mapping.connection.id,
    });
    await notifyWorkspaceManagers(
      mapping.workspaceId,
      `token-expired:${mapping.connection.id}`,
      `Action needed: reconnect @${mapping.connection.username}`,
      `The Instagram connection for @${mapping.connection.username} expired, so its automations cannot deliver right now. Reconnect the account from Settings to resume.`,
    );
  } catch (error) {
    logger.warn("Could not mark Instagram connection expired", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * UNKNOWN outcomes keep the monthly usage reservation alive forever - the
 * delivery can never be re-claimed to confirm or release it - so every path
 * that marks a delivery UNKNOWN must release the reservation first.
 */
async function markUnknown(
  repository: AutomationRepository,
  deliveryKey: string,
  owner: string | undefined,
  message: string,
): Promise<void> {
  await repository.releaseOutboundDeliveryReservation(deliveryKey).catch(() => false);
  await repository.markOutboundDeliveryUnknown(deliveryKey, owner, message).catch(() => false);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function currentPeriodStart(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function existingResult(record: OutboundDeliveryRecord): DeliveryExecutionResult | null {
  if (record.state === "SENT") {
    return {
      status: "SENT",
      providerMessageId: record.providerMessageId,
      reused: true,
      deliveryId: record.id,
    };
  }
  if (record.state === "UNKNOWN") {
    return { status: "UNKNOWN", error: record.lastError ?? "Provider result is ambiguous", reused: true };
  }
  if (record.state === "CLAIMED") return { status: "BUSY" };
  if (record.state === "FAILED" && !record.retryable) {
    return { status: "FAILED", retryable: false, error: record.lastError ?? "Delivery failed", reused: true };
  }
  return null;
}

/**
 * Warms the plan lookup executeOutboundDelivery makes before every send, so a
 * cold cache is read while the event's other reads run instead of in front of
 * the Meta call. Read-only, and a failure is ignored here - the send path
 * reads it again and handles the error itself.
 */
export async function prefetchDeliveryEntitlements(workspaceId: string): Promise<void> {
  try {
    const { getEntitlementService } = await import("../entitlements/service");
    await getEntitlementService().getMonthlyDeliveryLimit(workspaceId);
  } catch {
    // The send path's own read reports it.
  }
}

export async function executeOutboundDelivery<
  TPayload extends Record<string, unknown>,
>(
  request: DeliveryExecutionRequest<TPayload>,
  send: (payload: TPayload) => Promise<{ id?: string; message_id?: string }>,
): Promise<DeliveryExecutionResult> {
  const {
    claimLeaseMs,
    repository: suppliedRepository,
    entitlementService: suppliedEntitlementService,
    timingObserver,
    networkFailuresAreRetryable,
    ...deliveryInput
  } = request;
  const repository = suppliedRepository ?? getRepository();

  // Every Meta send checks the account's pause first, before any usage is
  // reserved. A delivery that already has an outcome keeps it: the pause
  // only holds new attempts.
  const pauseTarget = pauseTargetFor(request);
  let blockedUntil: number | undefined;
  if (pauseTarget) {
    const gate = await checkAccountSendGate(pauseTarget, { recovery: recoveryModeFor(request.kind) });
    if (gate.status !== "open") {
      const existing = await repository.getOutboundDelivery(request.deliveryKey).catch(() => null);
      const settled = existing ? existingResult(existing) : null;
      if (settled) return settled;
      if (gate.status !== "blocked") return holdForCoolDown(request.kind, gate);
      if (WAIT_OUT_BLOCK_KINDS.has(request.kind)) {
        // Nothing is recorded: the step stays due and is tried again later.
        return { status: "FAILED", retryable: true, error: heldSendReason(pauseTarget, gate.until), reason: "ACCOUNT_PAUSED" };
      }
      blockedUntil = gate.until;
    }
  }

  const owner = createId("delivery_claim");
  const leaseUntil = new Date(Date.now() + claimLeaseMs).toISOString();
  const entitlementService = suppliedEntitlementService
    ?? (await import("../entitlements/service")).getEntitlementService();
  let preparation: Awaited<ReturnType<typeof repository.prepareOutboundDelivery>>;
  try {
    const monthlyLimit = await entitlementService.getMonthlyDeliveryLimit(request.workspaceId);
    preparation = await repository.prepareOutboundDelivery({
      ...deliveryInput,
      owner,
      leaseUntil,
      periodStart: currentPeriodStart(new Date()),
      monthlyLimit,
    });
  } catch {
    const error = "Delivery usage could not be reserved";
    return { status: "FAILED", retryable: true, error };
  }
  if (preparation.status === "TERMINAL") {
    return existingResult(preparation.record) ?? { status: "BUSY" };
  }
  if (preparation.status === "BUSY") return { status: "BUSY" };
  if (preparation.status === "QUOTA_REJECTED") {
    // Home shows this too; the email reaches an owner who isn't looking.
    // Deduped per workspace and month, and a no-op until email is configured.
    const periodStart = currentPeriodStart(new Date());
    void notifyWorkspaceManagers(
      request.workspaceId,
      `plan-limit:${request.workspaceId}:${periodStart}`,
      "Your monthly message limit was reached",
      "Linkar has sent every message your plan includes this month, so automated replies are paused until the limit resets next month. Upgrade your plan in Settings → Billing to resume them now.",
    ).catch(() => undefined);
    return { status: "FAILED", retryable: false, error: "Monthly delivery limit reached", reason: "QUOTA_REJECTED" };
  }
  if (pauseTarget && blockedUntil !== undefined) {
    // Recorded like a plan-limit block: not attempted, nothing used, and the
    // reason says why in plain words. Not retried: a comment or DM answered a
    // day late would read as spam, and the window has usually closed by then.
    const reason = heldSendReason(pauseTarget, blockedUntil);
    await repository.releaseOutboundDeliveryReservation(request.deliveryKey).catch(() => false);
    await repository.failOutboundDelivery(request.deliveryKey, owner, reason, false, "SUPPRESSED").catch(() => false);
    return { status: "FAILED", retryable: false, error: reason, reason: "ACCOUNT_PAUSED" };
  }

  let providerResult: { id?: string; message_id?: string };
  let providerAccepted = false;
  const providerStartedAt = performance.now();
  timingObserver?.providerStarted();
  try {
    providerResult = await send(preparation.record.payload as TPayload);
    providerAccepted = true;
  } catch (error) {
    const message = errorMessage(error);
    const classification = classifyProviderFailure(error, networkFailuresAreRetryable);
    if (classification === "AMBIGUOUS") {
      await markUnknown(repository, request.deliveryKey, owner, message);
      return { status: "UNKNOWN", error: message };
    }

    const retryable = classification === "KNOWN_RETRYABLE";
    if (isInvalidTokenError(error) && request.instagramAccountId) {
      await expireInvalidInstagramConnection(repository, request.instagramAccountId);
    }
    const signal = pauseTarget ? providerAccountSignal(error) : null;
    const reason = signal === "account_blocked"
      ? (await pauseAccountAfterBlock(repository, pauseTarget!)).reason
      : message;
    // Meta's usage headers, when it sent them, can stretch the pause to its
    // own estimate of when access returns.
    const throttle = signal === "rate_limited"
      ? await recordAccountThrottle(pauseTarget!, { usage: error instanceof MetaApiError ? error.usage : null })
      : undefined;
    await repository.releaseOutboundDeliveryReservation(request.deliveryKey).catch(() => false);
    await repository.failOutboundDelivery(
      request.deliveryKey,
      owner,
      reason,
      retryable,
      retryable ? "RETRYABLE_REJECTION" : "PROVIDER_REJECTED",
    ).catch(() => false);
    const attempt = preparation.record.attemptCount;
    if (throttle && retryable && DEFERRABLE_KINDS.has(request.kind) && attempt <= THROTTLE_BACKOFF_MS.length) {
      // Wait 1, 5, then 15 minutes (or out the account pause) instead of the
      // queue's own retry, so a throttled send does not go straight back.
      // After the third wait it falls back to the job's own few attempts, so
      // a send Meta keeps refusing still ends instead of waiting forever.
      const waitMs = Math.max(
        throttleBackoffMs(attempt),
        (throttle.pausedUntil ?? 0) - Date.now(),
      );
      throw new SendDeferredError(ACCOUNT_THROTTLED_REASON, waitMs);
    }
    return { status: "FAILED", retryable, error: reason };
  } finally {
    timingObserver?.providerFinished(performance.now() - providerStartedAt, providerAccepted);
  }

  const providerMessageId = providerResult.id ?? providerResult.message_id;
  const sentAt = new Date().toISOString();
  try {
    const completed = await repository.completeOutboundDelivery(
      request.deliveryKey,
      owner,
      providerMessageId,
      sentAt,
    );
    if (!completed) {
      const message = "Provider succeeded but the delivery claim could not be completed";
      await markUnknown(repository, request.deliveryKey, owner, message);
      return { status: "UNKNOWN", error: message };
    }
  } catch (error) {
    const message = errorMessage(error);
    await markUnknown(repository, request.deliveryKey, owner, message);
    return { status: "UNKNOWN", error: message };
  }

  return { status: "SENT", providerMessageId, reused: false, deliveryId: preparation.record.id };
}
