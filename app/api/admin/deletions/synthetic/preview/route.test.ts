import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ write: vi.fn(), prepare: vi.fn(), audited: vi.fn() }));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminWrite: mocks.write }));
vi.mock("@/src/lib/admin/deletion/synthetic-cleanup", () => ({
  prepareSyntheticAccountCleanup: mocks.prepare,
  SYNTHETIC_CLEANUP_TARGET: { type: "SYNTHETIC_ACCOUNTS", id: "approved-test-patterns" },
}));
vi.mock("@/src/lib/admin/http", () => ({
  adminJson: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  adminRouteError: () => Response.json({ error: "failed" }, { status: 500 }),
  runAuditedAdminMutation: mocks.audited,
}));

import { POST } from "./route";

describe("synthetic cleanup preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.write.mockResolvedValue({ owner: { userId: "admin_1", sessionId: "session_1" } });
    mocks.prepare.mockResolvedValue({ count: 58, digest: "a".repeat(64), challenge: { token: "secret-challenge-token", expiresAt: "2026-10-10T10:00:00.000Z" } });
    mocks.audited.mockImplementation(async (_context, operation, options) => { const result = await operation(); options?.summarize?.(result); return result; });
  });

  it("uses a fixed server-side target and returns a no-store preview", async () => {
    const request = new Request("https://app.linkar.in/api/admin/deletions/synthetic/preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "https://app.linkar.in",
        "x-admin-reason": "remove generated test accounts",
        "idempotency-key": "synthetic-preview-123456",
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith(request, {
      action: "synthetic_cleanup.preview",
      targetType: "SYNTHETIC_ACCOUNTS",
      targetId: "approved-test-patterns",
    });
    expect(mocks.prepare).toHaveBeenCalledWith({ userId: "admin_1", sessionId: "session_1" });
    // Challenge issuance is audited without the token itself.
    expect(mocks.audited).toHaveBeenCalledOnce();
    const summary = mocks.audited.mock.calls[0][2].summarize(await mocks.prepare.mock.results[0].value);
    expect(summary).toEqual({ count: 58, digest: "a".repeat(64), challengeCreated: true, expiresAt: "2026-10-10T10:00:00.000Z" });
    expect(JSON.stringify(summary)).not.toContain("secret-challenge-token");
  });
});
