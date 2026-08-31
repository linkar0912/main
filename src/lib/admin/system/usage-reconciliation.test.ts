import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));

const { reconcileUsageReservations } = await import("./usage-reconciliation");

describe("reconcileUsageReservations", () => {
  it("returns the number of corrected cached periods without reading payload data", async () => {
    const client = { $executeRaw: vi.fn().mockResolvedValue(3) };
    await expect(reconcileUsageReservations(client as never)).resolves.toEqual({ periodsUpdated: 3 });
    expect(client.$executeRaw).toHaveBeenCalledOnce();
  });
});
