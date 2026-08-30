import { beforeEach, describe, expect, it, vi } from "vitest";
import { FacebookPageOwnershipError } from "@/src/lib/repository";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  listFacebookPages: vi.fn(),
  subscribe: vi.fn(),
  readSelection: vi.fn(),
  upsertFacebookPage: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ facebookApiVersion: "v25.0", facebookTokenEncryptionKey: "a".repeat(64) }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: "sealed-selection" }),
    delete: mocks.deleteCookie,
  }),
}));

vi.mock("@/src/lib/facebook/page-selection", () => ({
  FACEBOOK_PAGE_SELECTION_COOKIE: "linkar_facebook_page_selection",
  readFacebookPageSelection: mocks.readSelection,
}));

vi.mock("@/src/lib/facebook/oauth", () => ({
  listFacebookPages: mocks.listFacebookPages,
  subscribeFacebookPageToWebhooks: mocks.subscribe,
}));

vi.mock("@/src/lib/security/secrets", () => ({
  sealSecret: () => "sealed-page-token",
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ upsertFacebookPage: mocks.upsertFacebookPage }),
}));

const { POST } = await import("./route");

function selectRequest(): Request {
  return new Request("http://localhost/api/facebook/oauth/select", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageId: "page_1" }),
  });
}

describe("POST /api/facebook/oauth/select", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.readSelection.mockReset().mockReturnValue({
      workspaceId: "workspace_1",
      facebookUserId: "facebook_user_1",
      userAccessToken: "user-token",
      selectionExpiresAt: "2099-01-01T00:00:00.000Z",
    });
    mocks.listFacebookPages.mockReset().mockResolvedValue([
      { id: "page_1", name: "Linkar Page", accessToken: "page-token" },
    ]);
    mocks.subscribe.mockReset().mockResolvedValue({ subscribed: true });
    mocks.upsertFacebookPage.mockReset();
    mocks.deleteCookie.mockReset();
  });

  it("returns a specific conflict when the selected Page belongs to another workspace", async () => {
    mocks.upsertFacebookPage.mockRejectedValue(new FacebookPageOwnershipError());

    const response = await POST(selectRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This Facebook Page is already connected to another workspace",
      code: "already-connected",
    });
  });
});
