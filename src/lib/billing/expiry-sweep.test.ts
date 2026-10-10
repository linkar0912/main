import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sweepLapsedBillingEntitlements } = await import("./expiry-sweep");

const NOW = new Date("2026-10-10T00:00:00Z");
const ENDED = new Date("2026-10-04T00:00:00Z");
const BEFORE_END = new Date("2026-09-20T00:00:00Z");

type Row = { id: string; workspaceId: string; providerSubscriptionId: string; status: string; currentPeriodEnd: Date | null };
type Entitlement = { planId: string; updatedAt: Date };

function fakeClient(rows: Row[], entitlements: Record<string, Entitlement>) {
  const audits: Array<Record<string, unknown>> = [];
  const transaction = {
    billingSubscription: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null,
    },
    workspaceEntitlement: {
      findUnique: async ({ where }: { where: { workspaceId: string } }) => entitlements[where.workspaceId] ?? null,
      update: async ({ where, data }: { where: { workspaceId: string }; data: { planId: string } }) => {
        entitlements[where.workspaceId] = { planId: data.planId, updatedAt: NOW };
      },
    },
    adminAuditEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); } },
  };
  const client = {
    billingSubscription: {
      findMany: vi.fn(async ({ where, take }: {
        where: { id?: { gt: string }; status: { notIn: string[] }; currentPeriodEnd: { lte: Date } };
        take: number;
      }) => {
        const matching = rows
          .filter((row) => !where.id || row.id > where.id.gt)
          .filter((row) => !where.status.notIn.includes(row.status))
          .filter((row) => row.currentPeriodEnd && row.currentPeriodEnd <= where.currentPeriodEnd.lte)
          .filter((row) => entitlements[row.workspaceId] && entitlements[row.workspaceId].planId !== "plan_free")
          .sort((left, right) => left.id.localeCompare(right.id));
        return matching.slice(0, take).map(({ id }) => ({ id }));
      }),
    },
    $transaction: vi.fn((operation: (tx: unknown) => unknown) => operation(transaction)),
  };
  return { client, audits, entitlements };
}

function row(id: string, status: string, currentPeriodEnd: Date | null = ENDED): Row {
  return { id, workspaceId: `ws_${id}`, providerSubscriptionId: `sub_${id}`, status, currentPeriodEnd };
}

describe("lapsed billing sweep", () => {
  it.each(["CANCELLED", "HALTED", "PAUSED", "PENDING", "COMPLETED", "EXPIRED"])(
    "downgrades a %s subscription to Free once its paid period has ended, and only once",
    async (status) => {
      const { client, audits, entitlements } = fakeClient([row("a", status)], { ws_a: { planId: "plan_growth", updatedAt: BEFORE_END } });
      const invalidate = vi.fn();

      await expect(sweepLapsedBillingEntitlements({ client: client as never, now: NOW, invalidate }))
        .resolves.toEqual({ examined: 1, downgraded: 1, conflicts: 0 });
      expect(entitlements.ws_a.planId).toBe("plan_free");
      expect(invalidate).toHaveBeenCalledWith("ws_a");
      expect(audits).toEqual([expect.objectContaining({
        action: "billing.subscription.lapse", workspaceId: "ws_a", before: { planId: "plan_growth" },
      })]);

      await expect(sweepLapsedBillingEntitlements({ client: client as never, now: NOW, invalidate }))
        .resolves.toEqual({ examined: 0, downgraded: 0, conflicts: 0 });
      expect(invalidate).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps paid access while the period is still running or the subscription pays", async () => {
    const { client, entitlements } = fakeClient(
      [row("a", "CANCELLED", new Date("2026-10-20T00:00:00Z")), row("b", "ACTIVE"), row("c", "AUTHENTICATED"), row("d", "HALTED", null)],
      {
        ws_a: { planId: "plan_creator", updatedAt: BEFORE_END },
        ws_b: { planId: "plan_creator", updatedAt: BEFORE_END },
        ws_c: { planId: "plan_creator", updatedAt: BEFORE_END },
        ws_d: { planId: "plan_creator", updatedAt: BEFORE_END },
      },
    );

    await expect(sweepLapsedBillingEntitlements({ client: client as never, now: NOW, invalidate: vi.fn() }))
      .resolves.toMatchObject({ downgraded: 0 });
    expect(Object.values(entitlements).map((entitlement) => entitlement.planId)).toEqual(["plan_creator", "plan_creator", "plan_creator", "plan_creator"]);
  });

  it("leaves plans an admin assigned after the lapse, and custom plans, alone", async () => {
    const { client, entitlements } = fakeClient([row("a", "CANCELLED"), row("b", "CANCELLED")], {
      ws_a: { planId: "plan_agency", updatedAt: new Date("2026-10-06T00:00:00Z") },
      ws_b: { planId: "plan_enterprise", updatedAt: BEFORE_END },
    });

    await expect(sweepLapsedBillingEntitlements({ client: client as never, now: NOW, invalidate: vi.fn() }))
      .resolves.toEqual({ examined: 2, downgraded: 0, conflicts: 0 });
    expect(entitlements.ws_a.planId).toBe("plan_agency");
    expect(entitlements.ws_b.planId).toBe("plan_enterprise");
  });

  it("pages through every candidate and skips rows a concurrent webhook is writing", async () => {
    const rows = [row("a", "CANCELLED"), row("b", "CANCELLED"), row("c", "CANCELLED")];
    const { client, entitlements } = fakeClient(rows, {
      ws_a: { planId: "plan_creator", updatedAt: BEFORE_END },
      ws_b: { planId: "plan_creator", updatedAt: BEFORE_END },
      ws_c: { planId: "plan_creator", updatedAt: BEFORE_END },
    });
    const original = client.$transaction.getMockImplementation()!;
    client.$transaction
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(Object.assign(new Error("serialization failure"), { code: "P2034" }))
      .mockImplementation(original);

    await expect(sweepLapsedBillingEntitlements({ client: client as never, now: NOW, invalidate: vi.fn(), batchSize: 1 }))
      .resolves.toEqual({ examined: 3, downgraded: 2, conflicts: 1 });
    expect(entitlements.ws_b.planId).toBe("plan_creator");
  });
});
