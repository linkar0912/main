import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  createAutomation: vi.fn(),
  listAutomations: vi.fn(),
  listConnections: vi.fn(),
  listFacebookPages: vi.fn(),
  assertEntitled: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    createAutomation: mocks.createAutomation,
    listAutomations: mocks.listAutomations,
    listConnections: mocks.listConnections,
    listFacebookPages: mocks.listFacebookPages,
  }),
}));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));

const { GET, POST } = await import("./route");

describe("POST /api/automations", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.createAutomation.mockReset();
    mocks.listAutomations.mockReset().mockResolvedValue([]);
    mocks.listConnections.mockReset().mockResolvedValue([]);
    mocks.listFacebookPages.mockReset().mockResolvedValue([]);
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
  });

  it("rejects a new automation without an explicit provider and connection pin", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Comment reply",
        definition: { version: 1, trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] }, conditions: [], actions: [{ type: "private_reply", text: "Hello" }] },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_channel_target" });
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });

  it("rejects a provider and connection-pin mismatch", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "FACEBOOK",
        instagramAccountId: "ig_1",
        name: "Mismatched flow",
        definition: { version: 1, trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] }, conditions: [], actions: [{ type: "private_reply", text: "Hello" }] },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_channel_target" });
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });

  it("creates a Facebook automation with its verified Page target", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listFacebookPages.mockResolvedValue([{ pageId: "page_1", status: "CONNECTED" }]);
    mocks.createAutomation.mockImplementation(async (_workspaceId, input) => ({ id: "automation_1", ...input }));

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "FACEBOOK",
        facebookPageId: "page_1",
        name: "Page reply",
        definition: { version: 1, trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] }, conditions: [], actions: [{ type: "private_reply", text: "Hello" }] },
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createAutomation).toHaveBeenCalledWith("workspace_1", expect.objectContaining({
      provider: "FACEBOOK",
      facebookPageId: "page_1",
    }));
  });

  it("rejects a Messenger definition on the Facebook Page-comment channel with field-addressable issues", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listFacebookPages.mockResolvedValue([{ pageId: "page_1", status: "CONNECTED" }]);

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "FACEBOOK",
        facebookPageId: "page_1",
        name: "Invalid Page flow",
        definition: {
          version: 1,
          trigger: { type: "message", match: "any", keywords: [] },
          conditions: [],
          actions: [{ type: "send_text", text: "Hello" }],
        },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_channel_definition",
      issues: [
        { path: ["trigger", "type"], message: "Facebook Page comments do not support message triggers" },
        { path: ["actions", 0, "type"], message: "Facebook Page comments do not support send_text actions" },
      ],
    });
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });

  it("rejects a revoked session before creating an automation", async () => {
    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Comment reply", definition: {} }),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });

  it("rejects a revoked session before listing automations", async () => {
    const response = await GET(new Request("http://localhost/api/automations"));

    expect(response.status).toBe(401);
    expect(mocks.listAutomations).not.toHaveBeenCalled();
  });

  it("rejects automation names longer than 120 trimmed characters", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "INSTAGRAM",
        instagramAccountId: "ig_1",
        name: `  ${"a".repeat(121)}  `,
        definition: {
          version: 1,
          trigger: { type: "message", match: "any", keywords: [] },
          conditions: [],
          actions: [{ type: "send_text", text: "Hello" }],
        },
      }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });

  it("returns the literal automation-limit contract", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listConnections.mockResolvedValue([{ igUserId: "ig_1", status: "CONNECTED" }]);
    mocks.listAutomations.mockResolvedValue([{}, {}, {}]);
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("limit_reached", "automations", 3, 3));

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "INSTAGRAM",
        instagramAccountId: "ig_1",
        name: "Comment reply",
        definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hello" }] },
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "limit_reached", capability: "automations", used: 3, limit: 3 });
  });
});
