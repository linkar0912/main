import { beforeEach, describe, expect, it, vi } from "vitest";
import { FacebookOAuthError } from "@/src/lib/facebook/oauth";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  listFacebookPages: vi.fn(),
  readSelection: vi.fn(),
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
  }),
}));

vi.mock("@/src/lib/facebook/page-selection", () => ({
  FACEBOOK_PAGE_SELECTION_COOKIE: "linkar_facebook_page_selection",
  readFacebookPageSelection: mocks.readSelection,
}));

vi.mock("@/src/lib/facebook/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/facebook/oauth")>()),
  listFacebookPages: mocks.listFacebookPages,
}));

const { GET } = await import("./route");

function pagesRequest(): Request {
  return new Request("http://localhost/api/facebook/oauth/pages");
}

describe("GET /api/facebook/oauth/pages", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.readSelection.mockReset().mockReturnValue({
      workspaceId: "workspace_1",
      facebookUserId: "facebook_user_1",
      userAccessToken: "user-token",
      selectionExpiresAt: "2099-01-01T00:00:00.000Z",
    });
    mocks.listFacebookPages.mockReset();
  });

  it("lists the Pages the selection's user token can manage", async () => {
    mocks.listFacebookPages.mockResolvedValue([
      { id: "page_1", name: "Linkar Page", accessToken: "page-token", category: "Business" },
    ]);

    const response = await GET(pagesRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: "page_1", name: "Linkar Page", category: "Business" }],
    });
  });

  it("returns a readable error instead of crashing when Graph rejects the page listing", async () => {
    mocks.listFacebookPages.mockRejectedValue(new FacebookOAuthError("rate limited", 429));

    const response = await GET(pagesRequest());

    expect(response.status).toBe(502);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/temporarily unavailable/i);
  });

  it("returns a generic reconnect message for a non-retryable Graph failure", async () => {
    mocks.listFacebookPages.mockRejectedValue(new FacebookOAuthError("invalid token", 400));

    const response = await GET(pagesRequest());

    expect(response.status).toBe(502);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/reconnect/i);
  });
});
