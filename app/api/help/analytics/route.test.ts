import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  recordHelpSearch: vi.fn(),
  recordHelpFeedback: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    recordHelpSearch: mocks.recordHelpSearch,
    recordHelpFeedback: mocks.recordHelpFeedback,
  }),
}));

const { POST } = await import("./route");

describe("POST /api/help/analytics", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.recordHelpSearch.mockReset().mockResolvedValue({ id: "search_1" });
    mocks.recordHelpFeedback.mockReset().mockResolvedValue({ id: "feedback_1" });
  });

  it("records a bounded no-result search for the authenticated workspace", async () => {
    const response = await POST(new Request("https://app.linkar.in/api/help/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "search", query: "missing workflow", resultCount: 0 }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.recordHelpSearch).toHaveBeenCalledWith("workspace_1", expect.objectContaining({
      query: "missing workflow",
      resultCount: 0,
    }));
  });

  it("records boolean article feedback", async () => {
    const response = await POST(new Request("https://app.linkar.in/api/help/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "feedback", articleKey: "getting-started:0", helpful: true }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.recordHelpFeedback).toHaveBeenCalledWith("workspace_1", expect.objectContaining({
      articleKey: "getting-started:0",
      helpful: true,
    }));
  });

  it("rejects unauthenticated and malformed analytics", async () => {
    mocks.getValidatedSession.mockResolvedValueOnce(null);
    const unauthorized = await POST(new Request("https://app.linkar.in/api/help/analytics", { method: "POST" }));
    expect(unauthorized.status).toBe(401);

    const invalid = await POST(new Request("https://app.linkar.in/api/help/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "feedback", articleKey: "", helpful: "yes" }),
    }));
    expect(invalid.status).toBe(400);
  });
});
