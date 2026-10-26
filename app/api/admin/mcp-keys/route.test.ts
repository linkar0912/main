import { beforeEach, describe, expect, it, vi } from "vitest";

const owner = { userId: "11111111-1111-4111-8111-111111111111", email: "owner@linkar.in", sessionId: "session-1", aal: "aal2" as const };
const context = { owner, action: "mcp_key.create", targetType: "mcp_key", targetId: "Laptop", reason: "Connect Claude Code", idempotencyKey: "mcp-key-create-0001", requestId: "r1", origin: "https://admin.linkar.in", ipHash: "h", userAgent: "test" };
const summary = { id: "mcpkey_1", label: "Laptop", scope: "WRITE", tokenPrefix: "lkadm_AAAAAA", createdAt: "2026-10-25T12:00:00.000Z", expiresAt: "2026-11-24T12:00:00.000Z", lastUsedAt: null, revokedAt: null, status: "ACTIVE" };
const TOKEN = `lkadm_${"A".repeat(43)}`;

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), mint: vi.fn(), list: vi.fn(), revoke: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminSessionRead: mocks.read, requireAdminSessionWrite: mocks.write }));
vi.mock("@/src/lib/admin/mcp/keys", () => ({ MCP_KEY_TTL_DAYS: [1, 7, 30, 90], mintAdminMcpKey: mocks.mint, listAdminMcpKeys: mocks.list, revokeAdminMcpKey: mocks.revoke }));
vi.mock("@/src/lib/admin/audit", () => ({ appendAdminAuditEvent: mocks.audit }));

const { GET, POST } = await import("./route");
const { DELETE } = await import("./[id]/route");

function post(body: unknown) {
  return new Request("https://admin.linkar.in/api/admin/mcp-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("/api/admin/mcp-keys", () => {
  beforeEach(() => {
    mocks.read.mockReset().mockResolvedValue(owner);
    mocks.write.mockReset().mockResolvedValue(context);
    mocks.mint.mockReset().mockResolvedValue({ key: summary, token: TOKEN });
    mocks.list.mockReset().mockResolvedValue([summary]);
    mocks.revoke.mockReset().mockResolvedValue({ ...summary, status: "REVOKED", revokedAt: "2026-10-25T13:00:00.000Z" });
    mocks.audit.mockReset().mockResolvedValue(undefined);
  });

  it("lists only the signed-in owner's keys", async () => {
    const response = await GET(new Request("https://admin.linkar.in/api/admin/mcp-keys"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [summary] });
    expect(mocks.list).toHaveBeenCalledWith(owner.userId);
  });

  it("returns a new key once and keeps it out of the audit trail", async () => {
    const response = await POST(post({ label: "Laptop", scope: "WRITE", ttlDays: 30 }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { key: summary, token: TOKEN } });
    expect(mocks.write).toHaveBeenCalledWith(expect.any(Request), { action: "mcp_key.create", targetType: "mcp_key", targetId: "Laptop" });
    expect(mocks.mint).toHaveBeenCalledWith({ owner, label: "Laptop", scope: "WRITE", ttlDays: 30 });
    expect(mocks.audit.mock.calls.map(([event]) => event.phase)).toEqual(["ATTEMPT", "SUCCESS"]);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(TOKEN);
    expect(mocks.audit.mock.calls[1][0].after).toEqual({ id: "mcpkey_1", label: "Laptop", scope: "WRITE", expiresAt: summary.expiresAt });
  });

  it.each([
    [{ label: "L", scope: "WRITE", ttlDays: 30 }],
    [{ label: "Laptop", scope: "ADMIN", ttlDays: 30 }],
    [{ label: "Laptop", scope: "READ", ttlDays: 365 }],
  ])("rejects an invalid key request %#", async (body) => {
    expect((await POST(post(body))).status).toBe(422);
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it("passes on the guard's refusal, such as a call made with a key", async () => {
    mocks.write.mockRejectedValue({ status: 403, code: "mcp_key_not_allowed" });
    const response = await POST(post({ label: "Laptop", scope: "WRITE", ttlDays: 30 }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "mcp_key_not_allowed" });
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it("revokes a key and audits the revoked key", async () => {
    mocks.write.mockResolvedValue({ ...context, action: "mcp_key.revoke", targetId: "mcpkey_1" });
    const response = await DELETE(new Request("https://admin.linkar.in/api/admin/mcp-keys/mcpkey_1", { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({ id: "mcpkey_1" }) });

    expect(response.status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith(expect.any(Request), { action: "mcp_key.revoke", targetType: "mcp_key", targetId: "mcpkey_1" });
    expect(mocks.revoke).toHaveBeenCalledWith({ id: "mcpkey_1", ownerUserId: owner.userId });
    expect(mocks.audit.mock.calls[1][0].after).toMatchObject({ id: "mcpkey_1", status: "REVOKED" });
  });
});
