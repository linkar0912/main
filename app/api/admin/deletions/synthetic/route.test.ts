import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ write: vi.fn(), request: vi.fn(), audited: vi.fn() }));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminWrite: mocks.write }));
vi.mock("@/src/lib/admin/deletion/synthetic-cleanup", () => ({
  requestSyntheticAccountCleanup: mocks.request,
  SYNTHETIC_CLEANUP_TARGET: { type: "SYNTHETIC_ACCOUNTS", id: "approved-test-patterns" },
}));
vi.mock("@/src/lib/admin/http", () => ({
  adminJson: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  adminRouteError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 422 }),
  runAuditedAdminMutation: mocks.audited,
}));

import { POST } from "./route";

describe("synthetic cleanup route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.write.mockResolvedValue({ owner: { userId: "admin_1", sessionId: "session_1" } });
    mocks.request.mockResolvedValue({ id: "del_batch", state: "QUEUED" });
    mocks.audited.mockImplementation(async (_context, operation) => operation());
  });

  it("audits and queues a challenge-protected fixed cleanup batch", async () => {
    const request = new Request("https://app.linkar.in/api/admin/deletions/synthetic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        impactDigest: "a".repeat(64),
        confirmation: "DELETE 58 SYNTHETIC ACCOUNTS",
        challengeToken: "challenge-token-long-enough",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(202);
    expect(mocks.write).toHaveBeenCalledWith(request, {
      action: "synthetic_cleanup.create",
      targetType: "SYNTHETIC_ACCOUNTS",
      targetId: "approved-test-patterns",
    });
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ impactDigest: "a".repeat(64) }));
    expect(mocks.audited).toHaveBeenCalledOnce();
  });
});
