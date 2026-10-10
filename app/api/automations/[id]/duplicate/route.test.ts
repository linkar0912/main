import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getAutomation: vi.fn(),
  createAutomation: vi.fn(),
  listAutomations: vi.fn(),
  assertEntitled: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    getAutomation: mocks.getAutomation,
    createAutomation: mocks.createAutomation,
    listAutomations: mocks.listAutomations,
  }),
}));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));

const { POST } = await import("./route");

function duplicate() {
  return POST(
    new Request("http://localhost/api/automations/automation_1/duplicate", { method: "POST" }),
    { params: Promise.resolve({ id: "automation_1" }) },
  );
}

describe("POST /api/automations/[id]/duplicate", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.getAutomation.mockReset();
    mocks.createAutomation.mockReset().mockResolvedValue({ id: "automation_copy" });
    mocks.listAutomations.mockReset().mockResolvedValue([{ id: "automation_1" }]);
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
  });

  it("rejects a revoked session before duplicating an automation", async () => {
    const response = await duplicate();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.getAutomation).not.toHaveBeenCalled();
  });

  it("retains the Facebook provider and Page pin on the duplicate", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.getAutomation.mockResolvedValue({
      id: "automation_1",
      workspaceId: "workspace_1",
      provider: "FACEBOOK",
      facebookPageId: "page_1",
      name: "Page reply",
      definition: { version: 1 },
      priority: 7,
    });

    const response = await duplicate();

    expect(response.status).toBe(201);
    expect(mocks.assertEntitled).toHaveBeenCalledWith("workspace_1", "automations", 1);
    expect(mocks.createAutomation).toHaveBeenCalledWith("workspace_1", {
      provider: "FACEBOOK",
      facebookPageId: "page_1",
      name: "Page reply (copy)",
      definition: { version: 1 },
      priority: 7,
    });
  });

  it("enforces the automation plan limit like creating does", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.getAutomation.mockResolvedValue({
      id: "automation_1", workspaceId: "workspace_1", provider: "INSTAGRAM", instagramAccountId: "ig_1",
      name: "Reply", definition: { version: 1 }, priority: 0,
    });
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("limit_reached", "automations", 1, 1));

    const response = await duplicate();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "limit_reached", capability: "automations", used: 1, limit: 1 });
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });
});
