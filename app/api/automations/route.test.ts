import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  createAutomation: vi.fn(),
  listAutomations: vi.fn(),
  assertEntitled: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ createAutomation: mocks.createAutomation, listAutomations: mocks.listAutomations }),
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
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
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
    mocks.listAutomations.mockResolvedValue([{}, {}, {}]);
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("limit_reached", "automations", 3, 3));

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Comment reply",
        definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hello" }] },
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "limit_reached", capability: "automations", used: 3, limit: 3 });
  });
});
