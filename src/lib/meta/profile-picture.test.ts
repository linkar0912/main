import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfilePictureUrl: vi.fn(),
  unsealSecret: vi.fn(() => "plain-token"),
}));

vi.mock("./client", () => ({
  INSTAGRAM_LOGIN_API_VERSION: "v25.0",
  MetaClient: class {
    getProfilePictureUrl = mocks.getProfilePictureUrl;
  },
}));
vi.mock("../security/secrets", () => ({ unsealSecret: mocks.unsealSecret }));

const { clearProfilePictureCache, loadProfilePictureUrl } = await import("./profile-picture");

describe("loadProfilePictureUrl", () => {
  beforeEach(() => {
    clearProfilePictureCache();
    mocks.getProfilePictureUrl.mockReset();
    mocks.getProfilePictureUrl.mockResolvedValue("https://cdn.instagram.com/avatar.jpg");
  });

  it("shares concurrent lookups and reuses the avatar between screens", async () => {
    const options = { apiVersion: "v25.0", metaTokenEncryptionKey: "key" };

    const [first, second] = await Promise.all([
      loadProfilePictureUrl(options, "ig_1", "sealed-token"),
      loadProfilePictureUrl(options, "ig_1", "sealed-token"),
    ]);
    const third = await loadProfilePictureUrl(options, "ig_1", "sealed-token");

    expect(first).toBe("https://cdn.instagram.com/avatar.jpg");
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(mocks.getProfilePictureUrl).toHaveBeenCalledTimes(1);
  });

  it("refreshes the lookup after explicit invalidation", async () => {
    const options = { apiVersion: "v25.0", metaTokenEncryptionKey: "key" };
    await loadProfilePictureUrl(options, "ig_1", "sealed-token");
    clearProfilePictureCache("ig_1");
    await loadProfilePictureUrl(options, "ig_1", "sealed-token");

    expect(mocks.getProfilePictureUrl).toHaveBeenCalledTimes(2);
  });
});
