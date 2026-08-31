import { beforeEach, describe, expect, it, vi } from "vitest";

const context = { owner: { userId: "11111111-1111-4111-8111-111111111111", email: "owner@linkar.in", sessionId: "s", aal: "aal2" }, action: "user.invite", targetType: "user", targetId: "new@acme.test", reason: "Customer onboarding", idempotencyKey: "admin-user-create-1", requestId: "r1", origin: "https://app.linkar.in", ipHash: "h", userAgent: "test" };
const mocks = vi.hoisted(() => ({ requireAdminRead: vi.fn(), requireAdminWrite: vi.fn(), listAdminUsers: vi.fn(), createAdminUser: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminRead: mocks.requireAdminRead, requireAdminWrite: mocks.requireAdminWrite }));
vi.mock("@/src/lib/admin/accounts-provider", () => ({ getAdminAccountsRepository: () => ({ listAdminUsers: mocks.listAdminUsers }) }));
vi.mock("@/src/lib/admin/user-service", () => ({ createAdminUser: mocks.createAdminUser }));
vi.mock("@/src/lib/admin/audit", () => ({ appendAdminAuditEvent: mocks.audit }));
const { GET, POST } = await import("./route");

describe("/api/admin/users", () => {
  beforeEach(() => { mocks.requireAdminRead.mockReset().mockResolvedValue(context.owner); mocks.requireAdminWrite.mockReset().mockResolvedValue(context); mocks.listAdminUsers.mockReset().mockResolvedValue({ items: [], nextCursor: null }); mocks.createAdminUser.mockReset().mockResolvedValue({ id: "u1", email: "new@acme.test", invited: true }); mocks.audit.mockReset().mockResolvedValue(undefined); });
  it("blocks cross-tenant reads for non-owners", async () => { mocks.requireAdminRead.mockRejectedValue({ status: 403, code: "forbidden" }); const response = await GET(new Request("https://app.linkar.in/api/admin/users")); expect(response.status).toBe(403); expect(mocks.listAdminUsers).not.toHaveBeenCalled(); });
  it("invites the selected email and records both audit phases", async () => { const response = await POST(new Request("https://app.linkar.in/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "new@acme.test", mode: "INVITE" }) })); expect(response.status).toBe(201); expect(mocks.createAdminUser).toHaveBeenCalledWith({ email: "new@acme.test", mode: "INVITE" }); expect(mocks.audit.mock.calls.map(([event]) => event.phase)).toEqual(["ATTEMPT", "SUCCESS"]); });
  it("rejects malformed identities with 422", async () => { const response = await POST(new Request("https://app.linkar.in/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "bad", mode: "INVITE" }) })); expect(response.status).toBe(422); });
});
