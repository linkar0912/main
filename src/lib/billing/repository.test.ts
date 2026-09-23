import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPrismaBillingRepository } from "./repository";

describe("billing repository concurrency", () => {
  it("retries a serializable checkout conflict and then reuses the winning claim", async () => {
    const transaction = {
      billingCheckoutAttempt: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue({
          id: "checkout_winner", planId: "plan_creator", interval: "MONTHLY",
          state: "CREATING", providerSubscriptionId: null,
        }),
        create: vi.fn(),
      },
    };
    const client = {
      $transaction: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error("serialization failure"), { code: "P2034" }))
        .mockImplementationOnce((operation: (tx: typeof transaction) => unknown) => operation(transaction)),
    };
    const repository = createPrismaBillingRepository(client as never);

    await expect(repository.claimCheckout({
      workspaceId: "ws_1", planId: "plan_creator", interval: "MONTHLY",
      now: new Date("2026-09-04T12:00:00Z"), expiresAt: new Date("2026-09-04T12:15:00Z"),
    })).resolves.toEqual({ kind: "processing", attemptId: "checkout_winner" });
    expect(client.$transaction).toHaveBeenCalledTimes(2);
    expect(transaction.billingCheckoutAttempt.create).not.toHaveBeenCalled();
  });
});

describe("billing repository checkout verification", () => {
  function verificationClient(subscription: { count: number }) {
    const attemptUpdate = vi.fn().mockResolvedValue({ id: "checkout_1" });
    const client = {
      billingCheckoutAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: "checkout_1" }),
        update: attemptUpdate,
      },
      billingSubscription: {
        updateMany: vi.fn().mockResolvedValue(subscription),
      },
    };
    return { client, attemptUpdate };
  }

  it("marks the attempt verified only when the subscription row accepted the timestamp", async () => {
    const { client, attemptUpdate } = verificationClient({ count: 1 });
    const repository = createPrismaBillingRepository(client as never);

    await expect(repository.markCheckoutVerified("ws_1", "sub_1", new Date("2026-09-04T12:00:00Z")))
      .resolves.toBe("verified");
    expect(attemptUpdate).toHaveBeenCalledWith({
      where: { id: "checkout_1" },
      data: { state: "VERIFIED" },
    });
  });

  it("leaves the attempt ready when the subscription row does not exist yet", async () => {
    const { client, attemptUpdate } = verificationClient({ count: 0 });
    const repository = createPrismaBillingRepository(client as never);

    await expect(repository.markCheckoutVerified("ws_1", "sub_1", new Date("2026-09-04T12:00:00Z")))
      .resolves.toBe("subscription_not_found");
    expect(attemptUpdate).not.toHaveBeenCalled();
  });

  it("reports a missing ready attempt without touching any row", async () => {
    const attemptUpdate = vi.fn();
    const updateMany = vi.fn();
    const client = {
      billingCheckoutAttempt: { findFirst: vi.fn().mockResolvedValue(null), update: attemptUpdate },
      billingSubscription: { updateMany },
    };
    const repository = createPrismaBillingRepository(client as never);

    await expect(repository.markCheckoutVerified("ws_1", "sub_1", new Date("2026-09-04T12:00:00Z")))
      .resolves.toBe("attempt_not_found");
    expect(updateMany).not.toHaveBeenCalled();
    expect(attemptUpdate).not.toHaveBeenCalled();
  });
});
