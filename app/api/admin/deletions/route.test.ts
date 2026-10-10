import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ write: vi.fn(), prepare: vi.fn(), request: vi.fn(), append: vi.fn() }));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminWrite: mocks.write, requireAdminRead: vi.fn() }));
vi.mock("@/src/lib/admin/audit", () => ({ appendAdminAuditEvent: mocks.append }));
vi.mock("@/src/lib/admin/deletion/service", () => ({ prepareDeletion: mocks.prepare, requestPermanentDeletion: mocks.request }));
vi.mock("@/src/lib/admin/deletion/repository", () => ({ listDeletionJobs: vi.fn() }));

import { POST as preview } from "./preview/route";
import { POST as create } from "./route";

const USER_ID = "8b6f3c1e-2d4a-4f5b-9c7d-1a2b3c4d5e6f";

function post(url: string, body: unknown): Request {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("deletion routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.write.mockImplementation(async (_request, options) => ({ ...options, owner: { userId: "admin", sessionId: "s" }, requestId: "req", reason: "close account" }));
  });

  it.each([
    { kind: "USER", id: "not-a-uuid" },
    { kind: "WORKSPACE", id: "workspace/../../x" },
  ])("rejects a malformed target id before any lookup: %o", async (target) => {
    const response = await preview(post("https://app.linkar.in/api/admin/deletions/preview", { target }));
    expect(response.status).toBe(422);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("audits challenge issuance without recording the token", async () => {
    mocks.prepare.mockResolvedValue({ impact: { counts: { memberships: 1 } }, impactDigest: "d".repeat(64), confirmationPhrase: `DELETE USER ${USER_ID}`, challenge: { token: "secret-challenge-token", expiresAt: "2026-10-10T10:10:00.000Z" } });
    const response = await preview(post("https://app.linkar.in/api/admin/deletions/preview", { target: { kind: "USER", id: USER_ID } }));
    expect(response.status).toBe(200);
    const phases = mocks.append.mock.calls.map(([event]) => event.phase);
    expect(phases).toEqual(["ATTEMPT", "SUCCESS"]);
    expect(mocks.append.mock.calls[1][0].after).toMatchObject({ targetKind: "USER", targetId: USER_ID, challengeCreated: true });
    expect(JSON.stringify(mocks.append.mock.calls)).not.toContain("secret-challenge-token");
  });

  it("records a failed confirmation as an audited failure", async () => {
    mocks.request.mockRejectedValue(Object.assign(new Error("confirmation_mismatch"), { status: 422, code: "confirmation_mismatch" }));
    const response = await create(post("https://app.linkar.in/api/admin/deletions", {
      target: { kind: "WORKSPACE", id: "workspace_8b6f3c1e-2d4a-4f5b-9c7d-1a2b3c4d5e6f" },
      impactDigest: "d".repeat(64), confirmation: "DELETE WORKSPACE wrong", challengeToken: "challenge-token-long-enough",
    }));
    expect(response.status).toBe(422);
    expect(mocks.append.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "FAILURE", errorCode: "confirmation_mismatch", action: "deletion.create" });
  });
});
