import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findInstagram: vi.fn(), updateInstagram: vi.fn(), deleteInstagram: vi.fn(),
  refresh: vi.fn(), unsubscribe: vi.fn(), subscribe: vi.fn(), subscribedFields: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ platformOwnerUserIds: [], metaTokenEncryptionKey: "key", metaApiVersion: "v21.0" }) }));
vi.mock("@/src/lib/security/secrets", () => ({ unsealSecret: () => "token", sealSecret: () => "sealed" }));
vi.mock("@/src/lib/meta/oauth", () => ({ refreshInstagramToken: mocks.refresh }));
vi.mock("@/src/lib/meta/client", () => ({ MetaClient: class { unsubscribeFromWebhooks = mocks.unsubscribe; subscribeToWebhooks = mocks.subscribe; getSubscribedFields = mocks.subscribedFields; } }));
vi.mock("@/src/lib/facebook/oauth", () => ({ readFacebookPageWebhookSubscription: vi.fn(), subscribeFacebookPageToWebhooks: vi.fn(), unsubscribeFacebookPageFromWebhooks: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  instagramConnection: { findUnique: mocks.findInstagram, updateMany: mocks.updateInstagram, deleteMany: mocks.deleteInstagram },
  $transaction: mocks.transaction,
} }));
const { executeAdminIntegration } = await import("./service");

const connection = {
  id: "c1", igUserId: "ig1", username: "acme", status: "CONNECTED", version: 4, tokenExpiresAt: null,
  connectedAt: new Date("2026-09-01T00:00:00.000Z"), accessTokenEncrypted: "sealed",
  workspace: { id: "w1", name: "Acme", members: [] },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findInstagram.mockResolvedValue(connection);
  mocks.updateInstagram.mockResolvedValue({ count: 1 });
});

describe("integration commands", () => {
  it("leaves status and version untouched when Meta rejects a disconnect", async () => {
    mocks.unsubscribe.mockRejectedValue(new Error("meta down"));
    await expect(executeAdminIntegration("instagram", "c1", "disconnect", 4)).rejects.toMatchObject({ status: 503, code: "provider_unavailable" });
    expect(mocks.updateInstagram).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not bump the version when a token refresh fails", async () => {
    mocks.refresh.mockRejectedValue(new Error("expired"));
    await expect(executeAdminIntegration("instagram", "c1", "refresh_token", 4)).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(mocks.updateInstagram).not.toHaveBeenCalled();
  });

  it("does not bump the version when a subscription repair fails", async () => {
    mocks.subscribedFields.mockResolvedValue(["comments"]);
    mocks.subscribe.mockRejectedValue(new Error("meta down"));
    await expect(executeAdminIntegration("instagram", "c1", "repair_subscription", 4)).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(mocks.updateInstagram).not.toHaveBeenCalled();
  });

  it("stores a refreshed token with one versioned write after Meta succeeds", async () => {
    mocks.refresh.mockResolvedValue({ accessToken: "new", expiresIn: 3600 });
    await expect(executeAdminIntegration("instagram", "c1", "refresh_token", 4)).resolves.toMatchObject({ version: 5 });
    expect(mocks.updateInstagram).toHaveBeenCalledOnce();
    expect(mocks.updateInstagram.mock.calls[0][0]).toMatchObject({ where: { id: "c1", version: 4 }, data: { status: "CONNECTED", version: { increment: 1 } } });
  });
});
