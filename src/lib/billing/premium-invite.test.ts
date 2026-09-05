import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createPremiumInviteService, hashPremiumInviteCode } from "./premium-invite";

describe("premium invite codes", () => {
  it("normalizes codes before hashing", () => {
    expect(hashPremiumInviteCode(" linkar-abcd-1234 ")).toBe(hashPremiumInviteCode("LINKAR-ABCD-1234"));
  });

  it("creates an invite for the requested active paid plan", async () => {
    const record = {
      id: "invite_1",
      codeHash: "stored_hash",
      label: "Creator trial",
      planId: "plan_creator",
      durationDays: 30,
      expiresAt: null,
      revokedAt: null,
      createdByUserId: "u1",
      createdAt: new Date("2026-09-05T00:00:00.000Z"),
    };
    const client = {
      planDefinition: {
        findFirst: vi.fn().mockResolvedValue({ id: "plan_creator", key: "creator", name: "Creator", isActive: true }),
      },
      premiumInviteCode: { create: vi.fn().mockResolvedValue(record) },
    };
    const service = createPremiumInviteService(client as never);

    const result = await service.create({ label: "Creator trial", planKey: "creator", createdByUserId: "u1" });

    expect(client.planDefinition.findFirst).toHaveBeenCalledWith({
      where: { key: "creator", isActive: true },
      select: { id: true, key: true, name: true, isActive: true },
    });
    expect(client.premiumInviteCode.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ planId: "plan_creator" }),
    }));
    expect(result).toMatchObject({ plan: { key: "creator", name: "Creator" } });
  });

  it("rejects free and unavailable invite plans", async () => {
    const client = {
      planDefinition: { findFirst: vi.fn().mockResolvedValue(null) },
      premiumInviteCode: { create: vi.fn() },
    };
    const service = createPremiumInviteService(client as never);

    await expect(service.create({ label: "Free trial", planKey: "free", createdByUserId: "u1" })).rejects.toMatchObject({
      message: "invite_plan_unavailable",
      status: 422,
      code: "invite_plan_unavailable",
    });
    expect(client.planDefinition.findFirst).not.toHaveBeenCalled();

    await expect(service.create({ label: "Retired trial", planKey: "retired", createdByUserId: "u1" })).rejects.toMatchObject({
      message: "invite_plan_unavailable",
      status: 422,
      code: "invite_plan_unavailable",
    });
    expect(client.planDefinition.findFirst).toHaveBeenCalledWith({
      where: { key: "retired", isActive: true },
      select: { id: true, key: true, name: true, isActive: true },
    });
    expect(client.premiumInviteCode.create).not.toHaveBeenCalled();
  });

  it("redeems a valid code for exactly 30 days", async () => {
    const now = new Date("2026-09-05T10:00:00.000Z");
    const code = { id: "code_1", planId: "plan_agency", durationDays: 30, expiresAt: null, revokedAt: null };
    const transaction = {
      premiumInviteCode: { findUnique: vi.fn().mockResolvedValue(code) },
      premiumInviteRedemption: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }) => data),
      },
    };
    const client = { $transaction: vi.fn((work) => work(transaction)) };
    const service = createPremiumInviteService(client as never, () => now);

    const result = await service.redeem({ code: "LINKAR-ABCD-1234", workspaceId: "ws_1", userId: "user_1" });

    expect(result.planId).toBe("plan_agency");
    expect(result.expiresAt).toBe("2026-10-05T10:00:00.000Z");
    expect(transaction.premiumInviteRedemption.create).toHaveBeenCalledOnce();
  });

  it("rejects used, expired, revoked, and overlapping codes", async () => {
    const base = { id: "code_1", planId: "plan_agency", durationDays: 30, expiresAt: null, revokedAt: null };
    for (const [record, existing, error] of [
      [{ ...base, redemption: { id: "redemption_1" } }, null, "invite_code_used"],
      [{ ...base, expiresAt: new Date("2026-09-04T00:00:00Z") }, null, "invite_code_expired"],
      [{ ...base, revokedAt: new Date("2026-09-04T00:00:00Z") }, null, "invite_code_revoked"],
      [base, { id: "active_1" }, "premium_access_already_active"],
    ] as const) {
      const transaction = {
        premiumInviteCode: { findUnique: vi.fn().mockResolvedValue(record) },
        premiumInviteRedemption: { findFirst: vi.fn().mockResolvedValue(existing), create: vi.fn() },
      };
      const service = createPremiumInviteService({ $transaction: (work: (tx: unknown) => unknown) => work(transaction) } as never, () => new Date("2026-09-05T00:00:00Z"));
      await expect(service.redeem({ code: "LINKAR-X", workspaceId: "ws_1", userId: "user_1" })).rejects.toThrow(error);
    }
  });
});
