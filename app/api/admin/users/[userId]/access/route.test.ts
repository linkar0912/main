import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), access: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminWrite: mocks.guard }));
vi.mock("@/src/lib/admin/user-service", () => ({ setAdminUserAccess: mocks.access }));
vi.mock("@/src/lib/admin/audit", () => ({ appendAdminAuditEvent: mocks.audit }));
vi.mock("@/src/lib/admin/audit-snapshots", () => ({ userAuditSnapshot: vi.fn().mockResolvedValue({ email: "person@acme.test", status: "ACTIVE", authBannedUntil: null }) }));
const USER = "33333333-3333-4333-8333-333333333333";
const { POST } = await import("./route");
const context = { owner: { userId: "owner", email: "owner@linkar.in", sessionId: "s", aal: "aal2" }, action: "user.access.suspend", targetType: "user", targetId: "u1", reason: "Abuse investigation", idempotencyKey: "admin-access-0001", requestId: "r", origin: "https://app.linkar.in", ipHash: "h", userAgent: "test" };
describe("user access route", () => {
  beforeEach(() => { mocks.guard.mockReset().mockResolvedValue(context); mocks.access.mockReset().mockResolvedValue({ userId: "u1", status: "SUSPENDED" }); mocks.audit.mockReset().mockResolvedValue(undefined); });
  it("passes exact target, reason, and owner to the lifecycle command", async () => { const request = new Request(`https://app.linkar.in/api/admin/users/${USER}/access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SUSPEND" }) }); const response = await POST(request, { params: Promise.resolve({ userId: USER }) }); expect(response.status).toBe(200); expect(mocks.access).toHaveBeenCalledWith(USER, { action: "SUSPEND", reason: "Abuse investigation", actorUserId: "owner" }); });
  it("records failure when platform-owner protection rejects a target", async () => { mocks.access.mockRejectedValue({ status: 403, code: "platform_owner_protected" }); const request = new Request(`https://app.linkar.in/api/admin/users/${USER}/access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "BAN" }) }); const response = await POST(request, { params: Promise.resolve({ userId: USER }) }); expect(response.status).toBe(403); expect(mocks.audit.mock.calls.map(([event]) => event.phase)).toEqual(["ATTEMPT", "FAILURE"]); expect(mocks.audit.mock.calls[0][0].before).toMatchObject({ status: "ACTIVE" }); });
  it("answers 404 for a malformed user id before reaching Supabase", async () => { const response = await POST(new Request("https://app.linkar.in/api/admin/users/not-a-uuid/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SUSPEND" }) }), { params: Promise.resolve({ userId: "not-a-uuid" }) }); expect(response.status).toBe(404); expect(mocks.guard).not.toHaveBeenCalled(); expect(mocks.access).not.toHaveBeenCalled(); });
});
