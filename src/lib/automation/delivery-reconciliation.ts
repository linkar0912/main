import type { AutomationRepository } from "../repository";

const EXPIRED_CLAIM_REASON = "Delivery claim expired before confirmation";

export async function reconcileExpiredDeliveryClaims(
  repository: AutomationRepository,
  nowIso: string,
  limit: number,
): Promise<{ unknown: number }> {
  const expired = await repository.listExpiredDeliveryClaims(nowIso, limit);
  let unknown = 0;
  for (const delivery of expired) {
    const marked = await repository.markOutboundDeliveryUnknown(
      delivery.deliveryKey,
      undefined,
      EXPIRED_CLAIM_REASON,
    );
    if (marked) unknown += 1;
  }
  return { unknown };
}
