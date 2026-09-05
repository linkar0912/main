import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createPremiumInviteService, hashPremiumInviteCode } from "./premium-invite";

describe("premium invite codes", () => {
  it("normalizes codes before hashing", () => {
    expect(hashPremiumInviteCode(" linkar-abcd-1234 ")).toBe(hashPremiumInviteCode("LINKAR-ABCD-1234"));
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
