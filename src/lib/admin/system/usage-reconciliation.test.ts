import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));

const { reconcileUsageReservations } = await import("./usage-reconciliation");

describe("reconcileUsageReservations", () => {
  it("drops orphaned reservations, then returns corrected periods without reading payload data", async () => {
    const client = {
      $transaction: vi.fn(),
      $executeRaw: vi.fn()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(3),
    };
    client.$transaction.mockImplementation(async (work) => work(client));
    await expect(reconcileUsageReservations(client as never)).resolves.toEqual({ periodsUpdated: 3 });
    expect(client.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
