import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "../memory-repository";

describe("delivery repository concurrency", () => {
  it("does not overbook an automation daily send limit", async () => {
    const repository = createMemoryRepository();

    const results = await Promise.all([
      repository.claimAutomationSendSlots("automation_1", "2026-08-23", 2, 3),
      repository.claimAutomationSendSlots("automation_1", "2026-08-23", 2, 3),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    await repository.releaseAutomationSendSlots("automation_1", "2026-08-23", 1);
    await expect(repository.claimAutomationSendSlots(
      "automation_1",
      "2026-08-23",
      2,
      3,
    )).resolves.toBe(true);
  });

  it("claims and reserves a delivery exactly once under concurrent preparation", async () => {
    const repository = createMemoryRepository();
    const input = {
      deliveryKey: "delivery_concurrent",
      workspaceId: "workspace_a",
      automationId: "automation_1",
      instagramAccountId: "ig_1",
      recipientId: "person_1",
      kind: "CLASSIC_ACTION" as const,
      payload: { text: "hello" },
      owner: "owner_1",
      leaseUntil: "2026-08-23T10:05:00.000Z",
      periodStart: "2026-08-01",
      monthlyLimit: 1,
    };

    const results = await Promise.all([
      repository.prepareOutboundDelivery(input),
      repository.prepareOutboundDelivery({ ...input, owner: "owner_2" }),
    ]);

    expect(results.filter((result) => result.status === "CLAIMED")).toHaveLength(1);
    expect(results.filter((result) => result.status === "BUSY")).toHaveLength(1);

    await expect(repository.releaseOutboundDeliveryReservation(input.deliveryKey)).resolves.toBe(true);
    await expect(repository.releaseOutboundDeliveryReservation(input.deliveryKey)).resolves.toBe(false);
    await expect(repository.prepareOutboundDelivery({
      ...input,
      deliveryKey: "delivery_after_release",
      owner: "owner_3",
    })).resolves.toMatchObject({ status: "CLAIMED" });
  });

  it("returns terminal, busy, retryable, and quota preparation states without over-reserving", async () => {
    const repository = createMemoryRepository();
    const base = {
      workspaceId: "workspace_a",
      automationId: "automation_1",
      instagramAccountId: "ig_1",
      recipientId: "person_1",
      kind: "CLASSIC_ACTION" as const,
      payload: { text: "hello" },
      owner: "owner_prepare",
      leaseUntil: "2026-08-23T10:05:00.000Z",
      periodStart: "2026-08-01",
      monthlyLimit: 10,
    };

    await repository.ensureOutboundDelivery({ ...base, deliveryKey: "sent" });
    await repository.claimOutboundDelivery("sent", "seed", base.leaseUntil);
    await repository.completeOutboundDelivery("sent", "seed", "provider_1", "2026-08-23T10:01:00.000Z");
    await expect(repository.prepareOutboundDelivery({ ...base, deliveryKey: "sent" }))
      .resolves.toMatchObject({ status: "TERMINAL", record: { state: "SENT" } });

    await repository.ensureOutboundDelivery({ ...base, deliveryKey: "unknown" });
    await repository.claimOutboundDelivery("unknown", "seed", base.leaseUntil);
    await repository.markOutboundDeliveryUnknown("unknown", "seed", "network");
    await expect(repository.prepareOutboundDelivery({ ...base, deliveryKey: "unknown" }))
      .resolves.toMatchObject({ status: "TERMINAL", record: { state: "UNKNOWN" } });

    await repository.ensureOutboundDelivery({ ...base, deliveryKey: "permanent" });
    await repository.claimOutboundDelivery("permanent", "seed", base.leaseUntil);
    await repository.failOutboundDelivery("permanent", "seed", "bad request", false, "PROVIDER_REJECTED");
    await expect(repository.prepareOutboundDelivery({ ...base, deliveryKey: "permanent" }))
      .resolves.toMatchObject({ status: "TERMINAL", record: { state: "FAILED", retryable: false } });

    await repository.ensureOutboundDelivery({ ...base, deliveryKey: "busy" });
    await repository.claimOutboundDelivery("busy", "seed", base.leaseUntil);
    await expect(repository.prepareOutboundDelivery({ ...base, deliveryKey: "busy" }))
      .resolves.toMatchObject({ status: "BUSY", record: { state: "CLAIMED" } });

    await repository.ensureOutboundDelivery({ ...base, deliveryKey: "retryable" });
    await repository.claimOutboundDelivery("retryable", "seed", base.leaseUntil);
    await repository.failOutboundDelivery("retryable", "seed", "rate limit", true, "RETRYABLE_REJECTION");
    await expect(repository.prepareOutboundDelivery({ ...base, deliveryKey: "retryable" }))
      .resolves.toMatchObject({ status: "CLAIMED", record: { state: "CLAIMED", attemptCount: 2 } });

    await expect(repository.prepareOutboundDelivery({
      ...base,
      deliveryKey: "quota_first",
      monthlyLimit: 1,
    })).resolves.toMatchObject({ status: "QUOTA_REJECTED" });
    expect(await repository.getOutboundDelivery("quota_first")).toMatchObject({
      state: "FAILED",
      retryable: false,
      resultCode: "SUPPRESSED",
    });
  });
});
