import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), access: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminWrite: mocks.guard }));
vi.mock("@/src/lib/admin/user-service", () => ({ setAdminUserAccess: mocks.access }));
vi.mock("@/src/lib/admin/audit", () => ({ appendAdminAuditEvent: mocks.audit }));
const { POST } = await import("./route");
const context = { owner: { userId: "owner", email: "owner@linkar.in", sessionId: "s", aal: "aal2" }, action: "user.access.suspend", targetType: "user", targetId: "u1", reason: "Abuse investigation", idempotencyKey: "admin-access-0001", requestId: "r", origin: "https://app.linkar.in", ipHash: "h", userAgent: "test" };
describe("user access route", () => {
  beforeEach(() => { mocks.guard.mockReset().mockResolvedValue(context); mocks.access.mockReset().mockResolvedValue({ userId: "u1", status: "SUSPENDED" }); mocks.audit.mockReset().mockResolvedValue(undefined); });
  it("passes exact target, reason, and owner to the lifecycle command", async () => { const request = new Request("https://app.linkar.in/api/admin/users/u1/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SUSPEND" }) }); const response = await POST(request, { params: Promise.resolve({ userId: "u1" }) }); expect(response.status).toBe(200); expect(mocks.access).toHaveBeenCalledWith("u1", { action: "SUSPEND", reason: "Abuse investigation", actorUserId: "owner" }); });
  it("records failure when platform-owner protection rejects a target", async () => { mocks.access.mockRejectedValue({ status: 403, code: "platform_owner_protected" }); const request = new Request("https://app.linkar.in/api/admin/users/u1/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "BAN" }) }); const response = await POST(request, { params: Promise.resolve({ userId: "u1" }) }); expect(response.status).toBe(403); expect(mocks.audit.mock.calls.map(([event]) => event.phase)).toEqual(["ATTEMPT", "FAILURE"]); });
});
