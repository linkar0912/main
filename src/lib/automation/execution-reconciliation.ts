import type { AutomationRepository, ExecutionRecord } from "../repository";
import { facebookReplyDeliveryKey } from "../facebook/runner";
import { deliveryKeys } from "./outbound-delivery";

/**
 * How long past its claim lease a PROCESSING execution must sit before the
 * sweep settles it. Every queue retry of the same event happens within
 * seconds, and deferred sends (quiet hours, rate windows) release their claim,
 * so nothing live holds a claim this long.
 */
export const STALE_EXECUTION_AFTER_MS = 30 * 60 * 1_000;

export const INTERRUPTED_BEFORE_SENDING = "Interrupted before sending";
export const INTERRUPTED_WHILE_SENDING = "Interrupted while sending - the reply may have gone out";
export const INTERRUPTED_UNKNOWN = "Interrupted before it finished";

/** Classic flows send their actions in order, so this bounds the probe. */
const MAX_CLASSIC_ACTIONS = 20;

/**
 * The outbound-ledger keys this execution would have written, in send order,
 * or null when they cannot be derived from the execution alone.
 */
function ledgerKeysFor(execution: ExecutionRecord): ((index: number) => string | null) | null {
  const campaign = /^campaign:([^:]+):(.+)$/.exec(execution.dedupeKey);
  if (campaign) {
    const [, participantId, action] = campaign;
    return (index) => (index === 0 ? deliveryKeys.campaignAction(participantId, action) : null);
  }
  if (execution.dedupeKey === `${execution.automationId}:${execution.externalEventId}`) {
    return (index) => deliveryKeys.classicAction(execution.automationId, execution.externalEventId, index);
  }
  return null;
}

function reachedMeta(state: string | undefined): boolean {
  return state === "SENT" || state === "UNKNOWN" || state === "CLAIMED";
}

async function interruptionReason(repository: AutomationRepository, execution: ExecutionRecord): Promise<string> {
  const keyAt = ledgerKeysFor(execution);
  if (!keyAt) return INTERRUPTED_UNKNOWN;
  // Facebook Page replies share the classic dedupe key shape but keep their
  // own ledger row.
  if (execution.dedupeKey === `${execution.automationId}:${execution.externalEventId}`) {
    const pageReply = await repository.getOutboundDelivery(
      facebookReplyDeliveryKey(execution.automationId, execution.externalEventId),
    );
    if (pageReply) return reachedMeta(pageReply.state) ? INTERRUPTED_WHILE_SENDING : INTERRUPTED_BEFORE_SENDING;
  }
  for (let index = 0; index < MAX_CLASSIC_ACTIONS; index += 1) {
    const key = keyAt(index);
    if (!key) break;
    const delivery = await repository.getOutboundDelivery(key);
    if (!delivery) break;
    // Anything that reached (or may have reached) Meta.
    if (reachedMeta(delivery.state)) return INTERRUPTED_WHILE_SENDING;
  }
  return INTERRUPTED_BEFORE_SENDING;
}

/**
 * Settles executions a worker claimed and then never finished - a restart or
 * crash mid-event. The event's queue retry runs while the claim's lease is
 * still live, finds the claim taken, and completes without touching it, so
 * nothing else ever revisits the row: it would read "processing" forever.
 *
 * Settling only marks the execution FAILED with the reason; it never sends.
 * A FAILED execution can no longer be claimed, so a late redelivery of the
 * same event cannot send twice either.
 */
export async function reconcileStaleExecutions(
  repository: AutomationRepository,
  nowIso: string,
  limit: number,
  staleAfterMs = STALE_EXECUTION_AFTER_MS,
): Promise<{ failed: number }> {
  const cutoffIso = new Date(Date.parse(nowIso) - staleAfterMs).toISOString();
  const stale = await repository.listStaleExecutionClaims(cutoffIso, limit);
  let failed = 0;
  for (const execution of stale) {
    const reason = await interruptionReason(repository, execution);
    if (await repository.failStaleExecutionClaim(execution.id, cutoffIso, reason)) failed += 1;
  }
  return { failed };
}
