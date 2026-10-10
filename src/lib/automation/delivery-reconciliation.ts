import type { AutomationRepository } from "../repository";

const EXPIRED_CLAIM_REASON = "Delivery claim expired before confirmation";

export async function reconcileExpiredDeliveryClaims(
  repository: AutomationRepository,
  nowIso: string,
  limit: number,
): Promise<{ unknown: number }> {
  const expired = await repository.listExpiredDeliveryClaims(nowIso, limit);
  let unknown = 0;
  const broadcasts = new Map<string, { workspaceId: string; broadcastId: string }>();
  for (const delivery of expired) {
    // Expired claims are terminal, so their usage reservation must not outlive them.
    await repository.releaseOutboundDeliveryReservation(delivery.deliveryKey).catch(() => false);
    const marked = await repository.markOutboundDeliveryUnknown(
      delivery.deliveryKey,
      undefined,
      EXPIRED_CLAIM_REASON,
    );
    if (marked) unknown += 1;
    if (marked && delivery.broadcastId) {
      broadcasts.set(`${delivery.workspaceId}:${delivery.broadcastId}`, {
        workspaceId: delivery.workspaceId,
        broadcastId: delivery.broadcastId,
      });
    }
  }
  // The worker that held the claim died before settling its recipient, so no
  // one else will update this broadcast's progress - without this it would
  // show RUNNING forever.
  for (const { workspaceId, broadcastId } of broadcasts.values()) {
    await repository.reconcileBroadcastCounters(workspaceId, broadcastId).catch(() => undefined);
  }
  return { unknown };
}
