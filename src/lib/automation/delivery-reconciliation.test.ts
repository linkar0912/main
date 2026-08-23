import { describe, expect, it } from "vitest";
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
  });
});
