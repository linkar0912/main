import { beforeEach, describe, expect, it, vi } from "vitest";
import { FacebookPageOwnershipError } from "@/src/lib/repository";
import { FacebookOAuthError } from "@/src/lib/facebook/oauth";
import { createEntitlementService } from "@/src/lib/entitlements/service";
import { createMemoryEntitlementRepository } from "@/src/lib/entitlements/memory-repository";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  /** The Pages Graph lists for the person's Facebook account. */
  listGraphPages: vi.fn(),
  /** The workspace's stored Page rows. */
  listStoredPages: vi.fn(),
  subscribe: vi.fn(),
  readSelection: vi.fn(),
  upsertFacebookPage: vi.fn(),
  deleteCookie: vi.fn(),
  assertEntitled: vi.fn(),
  getMemberRole: vi.fn(),
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
  listFacebookPages: mocks.listGraphPages,
  subscribeFacebookPageToWebhooks: mocks.subscribe,
}));

vi.mock("@/src/lib/security/secrets", () => ({
  sealSecret: () => "sealed-page-token",
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ getMemberRole: mocks.getMemberRole, upsertFacebookPage: mocks.upsertFacebookPage, listFacebookPages: mocks.listStoredPages }),
}));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));

const { POST } = await import("./route");

function selectRequest(pageId = "page_1"): Request {
  return new Request("http://localhost/api/facebook/oauth/select", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageId }),
  });
}

/** The real Free plan rules: Facebook on, one Page. */
function onFreePlan() {
  mocks.assertEntitled.mockImplementation(createEntitlementService(createMemoryEntitlementRepository()).assertEntitled);
}

describe("POST /api/facebook/oauth/select", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.getMemberRole.mockReset().mockResolvedValue("OWNER");
    mocks.readSelection.mockReset().mockReturnValue({
      workspaceId: "workspace_1",
      facebookUserId: "facebook_user_1",
      userAccessToken: "user-token",
      selectionExpiresAt: "2099-01-01T00:00:00.000Z",
    });
    mocks.listGraphPages.mockReset().mockResolvedValue([
      { id: "page_1", name: "Linkar Page", accessToken: "page-token" },
    ]);
    mocks.listStoredPages.mockReset().mockResolvedValue([]);
    mocks.subscribe.mockReset().mockResolvedValue({ subscribed: true });
    mocks.upsertFacebookPage.mockReset();
    mocks.deleteCookie.mockReset();
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
  });

  it("refuses a plain member before reading the selection or calling Meta", async () => {
    mocks.getMemberRole.mockResolvedValue("MEMBER");

    const response = await POST(selectRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(mocks.readSelection).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
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
    mocks.listGraphPages.mockRejectedValue(new FacebookOAuthError("rate limited", 429));

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

  it("reconnects a Page the workspace already has on the Free plan instead of counting it against the limit", async () => {
    onFreePlan();
    mocks.listStoredPages.mockResolvedValue([
      { id: "fb_row_1", workspaceId: "workspace_1", pageId: "page_1", pageName: "Linkar Page", status: "EXPIRED" },
    ]);

    const response = await POST(selectRequest("page_1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ connected: true });
    expect(mocks.assertEntitled).toHaveBeenCalledWith("workspace_1", "facebook", 0);
    expect(mocks.upsertFacebookPage).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace_1",
      pageId: "page_1",
      status: "CONNECTED",
    }));
  });

  it("keeps the plan's Facebook switch, and the other Pages' count, when renewing a stored Page", async () => {
    const expiredPage = { id: "fb_row_1", workspaceId: "workspace_1", pageId: "page_1", pageName: "Linkar Page", status: "EXPIRED" };
    mocks.assertEntitled.mockImplementation(
      createEntitlementService(createMemoryEntitlementRepository({ overrides: { facebookEnabled: false } })).assertEntitled,
    );
    mocks.listStoredPages.mockResolvedValue([expiredPage]);

    const switchedOff = await POST(selectRequest("page_1"));
    expect(switchedOff.status).toBe(403);
    await expect(switchedOff.json()).resolves.toEqual({ error: "entitlement_required", capability: "facebook" });

    // Over the limit (after a downgrade, say): the other Page still counts,
    // as it does for an Instagram reconnect.
    onFreePlan();
    mocks.listStoredPages.mockResolvedValue([
      expiredPage,
      { id: "fb_row_2", workspaceId: "workspace_1", pageId: "page_2", pageName: "Second Page", status: "CONNECTED" },
    ]);
    const overLimit = await POST(selectRequest("page_1"));
    expect(overLimit.status).toBe(409);
    await expect(overLimit.json()).resolves.toEqual({ error: "limit_reached", capability: "facebook", used: 1, limit: 1 });

    expect(mocks.upsertFacebookPage).not.toHaveBeenCalled();
  });

  it("still refuses a second, different Page on the Free plan", async () => {
    onFreePlan();
    mocks.listGraphPages.mockResolvedValue([
      { id: "page_1", name: "Linkar Page", accessToken: "page-token" },
      { id: "page_2", name: "Second Page", accessToken: "page-token-2" },
    ]);
    mocks.listStoredPages.mockResolvedValue([
      { id: "fb_row_1", workspaceId: "workspace_1", pageId: "page_1", pageName: "Linkar Page", status: "EXPIRED" },
    ]);

    const response = await POST(selectRequest("page_2"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "limit_reached", capability: "facebook", used: 1, limit: 1 });
    expect(mocks.upsertFacebookPage).not.toHaveBeenCalled();
  });

  it("explains that full control of the Page is needed when Meta refuses the subscription for lack of it", async () => {
    // Graph answers 403 with error #200 (or #10) when the person has partial
    // access to the Page, so it cannot add Linkar to it.
    mocks.subscribe.mockRejectedValue(new FacebookOAuthError("(#200) Permissions error", 403));

    const response = await POST(selectRequest());

    expect(response.status).toBe(403);
    const body = await response.json() as { error: string };
    expect(body).toEqual({
      error: "You need full control of this Page on Facebook to connect it. Ask a Page admin for full control, or connect it from their account.",
    });
    expect(body.error).not.toMatch(/webhook|payload|recipient|\u2014/i);
    expect(mocks.upsertFacebookPage).not.toHaveBeenCalled();
  });

  it("keeps the temporary-unavailable answer when the subscription call hits a rate limit", async () => {
    mocks.subscribe.mockRejectedValue(new FacebookOAuthError("rate limited", 429));

    const response = await POST(selectRequest());

    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: string }).error).toMatch(/temporarily unavailable/i);
  });
});
