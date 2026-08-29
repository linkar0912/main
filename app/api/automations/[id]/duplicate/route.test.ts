import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getAutomation: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ getAutomation: mocks.getAutomation }),
}));

const { POST } = await import("./route");

describe("POST /api/automations/[id]/duplicate", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.getAutomation.mockReset();
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
});
