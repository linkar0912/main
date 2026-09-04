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
