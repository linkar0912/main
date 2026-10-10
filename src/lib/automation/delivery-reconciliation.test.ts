import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { reconcileExpiredDeliveryClaims } from "./delivery-reconciliation";

describe("delivery claim reconciliation", () => {
  it("marks expired claims UNKNOWN instead of making them retryable", async () => {
    const repository = createMemoryRepository();
    const deliveryKey = "sequence:enrollment_1:step:step_1";
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: "workspace_a",
      kind: "SEQUENCE_STEP",
      sequenceEnrollmentId: "enrollment_1",
      payload: { type: "text", text: "Hello" },
    });
    await repository.claimOutboundDelivery(
      deliveryKey,
      "worker_a",
      "2026-08-23T10:00:00.000Z",
    );
    const releaseReservation = vi.spyOn(repository, "releaseOutboundDeliveryReservation");

    await expect(reconcileExpiredDeliveryClaims(
      repository,
      "2026-08-23T10:00:00.000Z",
      100,
    )).resolves.toEqual({ unknown: 1 });
    expect(await repository.getOutboundDelivery(deliveryKey)).toMatchObject({
      state: "UNKNOWN",
      resultCode: "AMBIGUOUS",
      lastError: "Delivery claim expired before confirmation",
    });
    expect(releaseReservation).toHaveBeenCalledWith(deliveryKey);
  });

  it("finishes a broadcast whose last recipient's worker died mid-send", async () => {
    const repository = createMemoryRepository();
    const broadcast = await repository.createBroadcast("workspace_a", {
      name: "News", text: "Hi", segment: "all_contacts", total: 1,
    });
    const deliveryKey = `broadcast:${broadcast.id}:ig_1:lead_1`;
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: "workspace_a",
      broadcastId: broadcast.id,
      instagramAccountId: "ig_1",
      recipientId: "lead_1",
      kind: "BROADCAST_RECIPIENT",
      payload: { type: "text", text: "Hi" },
    });
    await repository.claimOutboundDelivery(deliveryKey, "worker_a", "2026-08-23T10:00:00.000Z");

    await reconcileExpiredDeliveryClaims(repository, "2026-08-23T10:00:00.000Z", 100);
    expect(await repository.getBroadcast("workspace_a", broadcast.id)).toMatchObject({ status: "COMPLETED", failed: 1 });
  });
});
