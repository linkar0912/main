import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getMemberRole: vi.fn(),
  setMessagingWindow: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ getMemberRole: mocks.getMemberRole, setMessagingWindow: mocks.setMessagingWindow }),
}));

const { PATCH } = await import("./route");

function patch(body: unknown): Request {
  return new Request("http://localhost/api/workspace/messaging", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/workspace/messaging", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "u1", email: "a@linkar.in", workspaceId: "w1" });
    mocks.getMemberRole.mockReset().mockResolvedValue("ADMIN");
    mocks.setMessagingWindow.mockReset().mockResolvedValue(undefined);
  });

  it("lets a manager change quiet hours", async () => {
    const response = await PATCH(patch({ startHour: 22, endHour: 7, timezone: "UTC" }));
    expect(response.status).toBe(200);
    expect(mocks.setMessagingWindow).toHaveBeenCalledWith("w1", { startHour: 22, endHour: 7, timezone: "UTC" });
  });

  it("refuses a plain member, including clearing the window", async () => {
    mocks.getMemberRole.mockResolvedValue("MEMBER");
    const response = await PATCH(patch(null));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(mocks.setMessagingWindow).not.toHaveBeenCalled();
  });
});
