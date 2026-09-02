import { beforeEach, describe, expect, it, vi } from "vitest";
import { FacebookPageOwnershipError } from "@/src/lib/repository";
import { FacebookOAuthError } from "@/src/lib/facebook/oauth";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  listFacebookPages: vi.fn(),
  subscribe: vi.fn(),
  readSelection: vi.fn(),
  upsertFacebookPage: vi.fn(),
  deleteCookie: vi.fn(),
  assertEntitled: vi.fn(),
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

vi.mock("@/src/lib/facebook/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/facebook/oauth")>()),
  listFacebookPages: mocks.listFacebookPages,
  subscribeFacebookPageToWebhooks: mocks.subscribe,
}));

vi.mock("@/src/lib/security/secrets", () => ({
  sealSecret: () => "sealed-page-token",
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ upsertFacebookPage: mocks.upsertFacebookPage, listFacebookPages: mocks.listFacebookPages }),
}));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
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
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
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

  it("returns the literal Facebook-feature contract without persisting the Page", async () => {
    // The entitlement recheck now runs immediately before the write (not
    // before the Graph API calls) to narrow the TOCTOU race window - so it
    // no longer blocks subscribe from happening, but it must still block the
    // actual connection from being persisted.
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("entitlement_required", "facebook"));

    const response = await POST(selectRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "entitlement_required", capability: "facebook" });
    expect(mocks.upsertFacebookPage).not.toHaveBeenCalled();
  });

  it("returns a readable error instead of crashing when Graph rejects the page listing", async () => {
    // The entitlement recheck runs after this call now, so the shared
    // listFacebookPages mock only needs to fail once here.
    mocks.listFacebookPages.mockRejectedValue(new FacebookOAuthError("rate limited", 429));

    const response = await POST(selectRequest());

    expect(response.status).toBe(502);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/temporarily unavailable/i);
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("returns a readable error instead of crashing when Graph rejects the webhook subscription call", async () => {
    mocks.subscribe.mockRejectedValue(new FacebookOAuthError("invalid page token", 400));

    const response = await POST(selectRequest());

    expect(response.status).toBe(502);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/reconnect and try again/i);
    expect(mocks.upsertFacebookPage).not.toHaveBeenCalled();
  });
});
