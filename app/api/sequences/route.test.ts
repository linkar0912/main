import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  getValidatedSession: vi.fn(),
  listSequences: vi.fn(),
  countEnrollmentsBySequence: vi.fn(),
  createSequence: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    listSequences: mocks.listSequences,
    countEnrollmentsBySequence: mocks.countEnrollmentsBySequence,
    createSequence: mocks.createSequence,
  }),
}));

const { GET, POST } = await import("./route");

describe("/api/sequences session validation", () => {
  beforeEach(() => {
    mocks.getSessionFromRequest.mockReset().mockReturnValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.listSequences.mockReset().mockResolvedValue([]);
    mocks.countEnrollmentsBySequence.mockReset().mockResolvedValue([]);
    mocks.createSequence.mockReset();
  });

  it("rejects a revoked session before listing sequences", async () => {
    const response = await GET(new Request("http://localhost/api/sequences"));
    expect(response.status).toBe(401);
    expect(mocks.listSequences).not.toHaveBeenCalled();
  });

  it("rejects a revoked session before creating a sequence", async () => {
    const response = await POST(new Request("http://localhost/api/sequences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Follow up", status: "DRAFT", steps: [{ id: "step_1", delayHours: 0, text: "Hello" }] }),
    }));
    expect(response.status).toBe(401);
    expect(mocks.createSequence).not.toHaveBeenCalled();
  });
});
