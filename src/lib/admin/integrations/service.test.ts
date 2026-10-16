import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findInstagram: vi.fn(), findFacebook: vi.fn(), transaction: vi.fn(),
  unsubscribeInstagram: vi.fn(), unsubscribeFacebook: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ platformOwnerUserIds: [], metaTokenEncryptionKey: "key", metaApiVersion: "v25.0", facebookApiVersion: "v25.0" }) }));
vi.mock("@/src/lib/security/secrets", () => ({ unsealSecret: () => "token", sealSecret: () => "sealed" }));
vi.mock("@/src/lib/meta/oauth", () => ({ refreshInstagramToken: vi.fn() }));
vi.mock("@/src/lib/meta/client", () => ({ MetaClient: class { unsubscribeFromWebhooks = mocks.unsubscribeInstagram; } }));
vi.mock("@/src/lib/facebook/oauth", () => ({ readFacebookPageWebhookSubscription: vi.fn(), subscribeFacebookPageToWebhooks: vi.fn(), unsubscribeFacebookPageFromWebhooks: mocks.unsubscribeFacebook }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  instagramConnection: { findUnique: mocks.findInstagram },
  facebookPageConnection: { findUnique: mocks.findFacebook },
  $transaction: mocks.transaction,
} }));
const { expiryBucket } = await import("./repository");
const { executeAdminIntegration } = await import("./service");

describe("integration health derivation", () => { const now = new Date("2026-08-31T10:00:00.000Z"); it("classifies bounded token expiry windows without token material", () => { expect(expiryBucket(new Date("2026-09-05T10:00:00.000Z"), now)).toBe("within_7_days"); expect(expiryBucket(new Date("2026-08-30T10:00:00.000Z"), now)).toBe("expired"); expect(expiryBucket(null, now)).toBe("unknown"); }); });

describe("integration disconnect", () => {
  const workspace = { id: "w1", name: "Acme", members: [] };
  const connectedAt = new Date("2026-09-01T00:00:00.000Z");
  const tx = {
    instagramConnection: { deleteMany: vi.fn() },
    facebookPageConnection: { deleteMany: vi.fn() },
    automation: { updateMany: vi.fn() },
    automationParticipant: { updateMany: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findInstagram.mockResolvedValue({ id: "c1", igUserId: "ig1", username: "acme", status: "CONNECTED", version: 4, tokenExpiresAt: null, connectedAt, accessTokenEncrypted: "sealed", workspace });
    mocks.findFacebook.mockResolvedValue({ id: "p1", pageId: "page1", pageName: "Acme", status: "CONNECTED", version: 2, tokenExpiresAt: null, connectedAt, accessTokenEncrypted: "sealed", workspace });
    mocks.unsubscribeInstagram.mockResolvedValue(undefined);
    mocks.unsubscribeFacebook.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (run: (client: typeof tx) => Promise<unknown>) => run(tx));
    tx.instagramConnection.deleteMany.mockResolvedValue({ count: 1 });
    tx.facebookPageConnection.deleteMany.mockResolvedValue({ count: 1 });
    tx.automation.updateMany.mockResolvedValue({ count: 1 });
    tx.automationParticipant.updateMany.mockResolvedValue({ count: 3 });
  });

  it("expires only open campaign participants, so finished history and the funnel counts stay as they were", async () => {
    await expect(executeAdminIntegration("instagram", "c1", "disconnect", 4)).resolves.toMatchObject({ disconnected: true });

    expect(tx.automationParticipant.updateMany).toHaveBeenCalledOnce();
    const update = tx.automationParticipant.updateMany.mock.calls[0][0];
    expect(update).toEqual({
      where: {
        workspaceId: "w1",
        instagramAccountId: "ig1",
        state: { in: ["COMMENT_MATCHED", "OPENING_SENT", "OPTED_IN", "FOLLOW_REQUIRED", "FOLLOW_VERIFIED"] },
      },
      data: { state: "EXPIRED" },
    });
    expect(update.where.state.in).not.toContain("LINK_SENT");
    expect(update.where.state.in).not.toContain("FAILED");
  });

  it.each([
    ["instagram", "c1", 4],
    ["facebook", "p1", 2],
  ] as const)("gives the %s disconnect transaction a short connection wait and room to finish", async (provider, id, version) => {
    await expect(executeAdminIntegration(provider, id, "disconnect", version)).resolves.toMatchObject({ disconnected: true });

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ maxWait: 5_000, timeout: 60_000 });
  });

  it("changes nothing past the connection row when the version is stale", async () => {
    tx.instagramConnection.deleteMany.mockResolvedValue({ count: 0 });

    await expect(executeAdminIntegration("instagram", "c1", "disconnect", 4)).rejects.toMatchObject({ status: 409, code: "stale_version" });
    expect(tx.automation.updateMany).not.toHaveBeenCalled();
    expect(tx.automationParticipant.updateMany).not.toHaveBeenCalled();
  });
});
