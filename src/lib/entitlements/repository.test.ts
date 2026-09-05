import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createPrismaEntitlementRepository } from "./repository";

const free = {
  key: "free", name: "Free", memberLimit: 1, automationLimit: 5, instagramConnectionLimit: 1,
  facebookConnectionLimit: 1, sequenceLimit: 0, monthlyBroadcastLimit: 0, monthlyDeliveryLimit: 1_000,
  sequencesEnabled: false, broadcastsEnabled: false, trackedLinksEnabled: false, teamEnabled: false,
  facebookEnabled: true, exportsEnabled: false,
};
const agency = { ...free, key: "agency", name: "Agency", memberLimit: 10, automationLimit: 100, monthlyDeliveryLimit: 50_000, sequencesEnabled: true };

describe("Prisma entitlement repository", () => {
  it("uses an active premium redemption over the paid/base plan", async () => {
    const client = {
      workspaceEntitlement: { findUnique: vi.fn().mockResolvedValue({ overrides: {}, plan: free }) },
      premiumInviteRedemption: { findFirst: vi.fn().mockResolvedValue({ plan: agency }) },
    };
    const repository = createPrismaEntitlementRepository(client as never, () => new Date("2026-09-05T00:00:00Z"));
    await expect(repository.getWorkspaceEntitlement("ws_1")).resolves.toMatchObject({ plan: { key: "agency", automationLimit: 100 } });
  });

  it("falls back automatically when no premium redemption is active", async () => {
    const client = {
      workspaceEntitlement: { findUnique: vi.fn().mockResolvedValue({ overrides: { automationLimit: 7 }, plan: free }) },
      premiumInviteRedemption: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const repository = createPrismaEntitlementRepository(client as never, () => new Date("2026-10-06T00:00:00Z"));
    await expect(repository.getWorkspaceEntitlement("ws_1")).resolves.toMatchObject({ plan: { key: "free" }, overrides: { automationLimit: 7 } });
  });
});
