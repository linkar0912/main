import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  getValidatedSession: vi.fn(),
  updateSequence: vi.fn(),
  deleteSequence: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ updateSequence: mocks.updateSequence, deleteSequence: mocks.deleteSequence }),
}));

const { PATCH, DELETE } = await import("./route");
const context = { params: Promise.resolve({ id: "sequence_1" }) };

describe("/api/sequences/[id] session validation", () => {
  beforeEach(() => {
    mocks.getSessionFromRequest.mockReset().mockReturnValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.updateSequence.mockReset();
    mocks.deleteSequence.mockReset();
  });

  it("rejects a revoked session before updating", async () => {
    const response = await PATCH(new Request("http://localhost/api/sequences/sequence_1", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "PAUSED" }),
    }), context);
    expect(response.status).toBe(401);
    expect(mocks.updateSequence).not.toHaveBeenCalled();
  });

  it("rejects a revoked session before deleting", async () => {
    const response = await DELETE(new Request("http://localhost/api/sequences/sequence_1", { method: "DELETE" }), context);
    expect(response.status).toBe(401);
    expect(mocks.deleteSequence).not.toHaveBeenCalled();
  });
});
