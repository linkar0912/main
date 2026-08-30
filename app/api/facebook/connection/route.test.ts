import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listFacebookPages: vi.fn(),
  deleteFacebookPage: vi.fn(),
  unsubscribe: vi.fn(),
  session: { workspaceId: "ws_1", userId: "u_1" } as { workspaceId: string; userId: string } | null,
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: async () => mocks.session,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    listFacebookPages: mocks.listFacebookPages,
    deleteFacebookPage: mocks.deleteFacebookPage,
  }),
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ facebookTokenEncryptionKey: "a".repeat(64), facebookApiVersion: "v25.0" }),
}));

vi.mock("@/src/lib/security/secrets", () => ({ unsealSecret: () => "page-token" }));
vi.mock("@/src/lib/facebook/oauth", () => ({
  unsubscribeFacebookPageFromWebhooks: (...args: unknown[]) => mocks.unsubscribe(...args),
}));

const { GET, DELETE } = await import("./route");

beforeEach(() => {
  mocks.session = { workspaceId: "ws_1", userId: "u_1" };
  mocks.listFacebookPages.mockReset();
  mocks.deleteFacebookPage.mockReset();
  mocks.unsubscribe.mockReset().mockResolvedValue(true);
});

describe("GET /api/facebook/connection", () => {
  it("returns 401 when no session", async () => {
    mocks.session = null;
    const response = await GET(new Request("http://localhost/api/facebook/connection"));
    expect(response.status).toBe(401);
  });

  it("returns the workspace's pages without the access token", async () => {
    mocks.listFacebookPages.mockResolvedValue([
      { id: "rec_1", workspaceId: "ws_1", pageId: "p_1", pageName: "Acme",
        accessTokenEncrypted: "sealed", status: "CONNECTED", connectedAt: "2026-01-01T00:00:00.000Z", tokenExpiresAt: null },
    ]);
    const response = await GET(new Request("http://localhost/api/facebook/connection"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{
        id: "rec_1", pageId: "p_1", pageName: "Acme", status: "CONNECTED",
        connectedAt: "2026-01-01T00:00:00.000Z",
      }],
    });
  });
});

describe("DELETE /api/facebook/connection", () => {
  it("returns 400 when no page id", async () => {
    const response = await DELETE(new Request("http://localhost/api/facebook/connection", {
      method: "DELETE", body: JSON.stringify({}),
    }));
    expect(response.status).toBe(400);
  });

  it("returns 404 when the repository can't find the page", async () => {
    mocks.deleteFacebookPage.mockResolvedValue(false);
    const response = await DELETE(new Request("http://localhost/api/facebook/connection", {
      method: "DELETE", body: JSON.stringify({ id: "rec_missing" }),
    }));
    expect(response.status).toBe(404);
  });

  it("disconnects when the repository finds the page", async () => {
    mocks.listFacebookPages.mockResolvedValue([{ id: "rec_1", pageId: "p_1", accessTokenEncrypted: "sealed" }]);
    mocks.deleteFacebookPage.mockResolvedValue(true);
    const response = await DELETE(new Request("http://localhost/api/facebook/connection", {
      method: "DELETE", body: JSON.stringify({ id: "rec_1" }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ disconnected: true, remoteUnsubscribed: true });
    expect(mocks.deleteFacebookPage).toHaveBeenCalledWith("ws_1", "rec_1");
    expect(mocks.unsubscribe).toHaveBeenCalledWith("p_1", "page-token", "v25.0");
  });

  it("removes the local connection when Meta cannot unsubscribe an expired Page token", async () => {
    mocks.listFacebookPages.mockResolvedValue([{ id: "rec_1", pageId: "p_1", accessTokenEncrypted: "sealed" }]);
    mocks.unsubscribe.mockRejectedValue(new Error("Meta request failed (401)"));
    mocks.deleteFacebookPage.mockResolvedValue(true);

    const response = await DELETE(new Request("http://localhost/api/facebook/connection", {
      method: "DELETE", body: JSON.stringify({ id: "rec_1" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ disconnected: true, remoteUnsubscribed: false });
    expect(mocks.deleteFacebookPage).toHaveBeenCalledWith("ws_1", "rec_1");
  });

  it("returns 500 when the repository throws", async () => {
    mocks.deleteFacebookPage.mockRejectedValue(new Error("db down"));
    const response = await DELETE(new Request("http://localhost/api/facebook/connection", {
      method: "DELETE", body: JSON.stringify({ id: "rec_1" }),
    }));
    expect(response.status).toBe(500);
  });
});
