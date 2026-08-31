import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getAutomation: vi.fn(),
  createAutomation: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ getAutomation: mocks.getAutomation, createAutomation: mocks.createAutomation }),
}));

const { POST } = await import("./route");

describe("POST /api/automations/[id]/duplicate", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.getAutomation.mockReset();
    mocks.createAutomation.mockReset().mockResolvedValue({ id: "automation_copy" });
  });

  it("rejects a revoked session before duplicating an automation", async () => {
    const response = await POST(
      new Request("http://localhost/api/automations/automation_1/duplicate", { method: "POST" }),
      { params: Promise.resolve({ id: "automation_1" }) },
    );

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
    });

    const response = await POST(
      new Request("http://localhost/api/automations/automation_1/duplicate", { method: "POST" }),
      { params: Promise.resolve({ id: "automation_1" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.createAutomation).toHaveBeenCalledWith("workspace_1", {
      provider: "FACEBOOK",
      facebookPageId: "page_1",
      name: "Page reply (copy)",
      definition: { version: 1 },
    });
  });
});
