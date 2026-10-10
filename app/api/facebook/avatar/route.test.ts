import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  listFacebookPages: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ facebookTokenEncryptionKey: "0".repeat(64), facebookApiVersion: "v25.0", facebookAppSecret: "secret" }),
}));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ listFacebookPages: mocks.listFacebookPages }) }));

const { GET } = await import("./route");

describe("GET /api/facebook/avatar", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "u1", workspaceId: "w1", email: "a@example.com" });
    mocks.listFacebookPages.mockReset().mockResolvedValue([]);
  });

  it.each(["../me/accounts", "123?fields=access_token", "me", "1".repeat(33), "12/34"])(
    "rejects a non-numeric profile id %s before any Graph call",
    async (profileId) => {
      const url = new URL("https://app.linkar.in/api/facebook/avatar");
      url.searchParams.set("pageId", "page_1");
      url.searchParams.set("profileId", profileId);
      const response = await GET(new Request(url));
      expect(response.status).toBe(400);
      expect(mocks.listFacebookPages).not.toHaveBeenCalled();
    },
  );

  it("accepts a numeric profile id", async () => {
    const response = await GET(new Request("https://app.linkar.in/api/facebook/avatar?pageId=page_1&profileId=1234567890"));
    // No connected page in this workspace, so it 404s after validation.
    expect(response.status).toBe(404);
    expect(mocks.listFacebookPages).toHaveBeenCalledWith("w1");
  });
});
