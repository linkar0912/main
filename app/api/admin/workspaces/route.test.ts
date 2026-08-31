import { beforeEach, describe, expect, it, vi } from "vitest";

const WRITE_CONTEXT = {
  owner: { userId: "11111111-1111-4111-8111-111111111111", email: "owner@linkar.in", sessionId: "s1", aal: "aal2" },
  action: "workspace.create",
  targetType: "workspace",
  targetId: "new",
  reason: "Create customer workspace",
  idempotencyKey: "workspace-create-0001",
  requestId: "req1",
  origin: "https://app.linkar.in",
  ipHash: "hash",
  userAgent: "test",
};

const mocks = vi.hoisted(() => ({
  requireAdminRead: vi.fn(),
  requireAdminWrite: vi.fn(),
  listAdminWorkspaces: vi.fn(),
  createAdminWorkspace: vi.fn(),
  appendAdminAuditEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminRead: mocks.requireAdminRead, requireAdminWrite: mocks.requireAdminWrite }));
vi.mock("@/src/lib/admin/accounts-provider", () => ({ getAdminAccountsRepository: () => ({ listAdminWorkspaces: mocks.listAdminWorkspaces }) }));
vi.mock("@/src/lib/admin/workspace-service", () => ({ createAdminWorkspace: mocks.createAdminWorkspace }));
vi.mock("@/src/lib/admin/audit", () => ({ appendAdminAuditEvent: mocks.appendAdminAuditEvent }));

const { GET, POST } = await import("./route");

function writeRequest(body: unknown) {
  return new Request("https://app.linkar.in/api/admin/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/workspaces", () => {
  beforeEach(() => {
    mocks.requireAdminRead.mockReset().mockResolvedValue(WRITE_CONTEXT.owner);
    mocks.requireAdminWrite.mockReset().mockResolvedValue(WRITE_CONTEXT);
    mocks.listAdminWorkspaces.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    mocks.createAdminWorkspace.mockReset().mockResolvedValue({ id: "w1", name: "Acme", slug: "acme-team", status: "ACTIVE", version: 1 });
    mocks.appendAdminAuditEvent.mockReset().mockResolvedValue(undefined);
  });

  it("does not disclose workspace data to a non-owner", async () => {
    mocks.requireAdminRead.mockRejectedValue({ status: 403, code: "forbidden" });
    const response = await GET(new Request("https://app.linkar.in/api/admin/workspaces"));
    expect(response.status).toBe(403);
    expect(mocks.listAdminWorkspaces).not.toHaveBeenCalled();
  });

  it("creates a workspace and appends ATTEMPT/SUCCESS audit phases", async () => {
    const response = await POST(writeRequest({ name: "Acme", slug: "acme-team", ownerUserId: "22222222-2222-4222-8222-222222222222" }));
    expect(response.status).toBe(201);
    expect(mocks.appendAdminAuditEvent.mock.calls.map(([event]) => event.phase)).toEqual(["ATTEMPT", "SUCCESS"]);
  });

  it("returns a literal duplicate-slug conflict and audits failure", async () => {
    mocks.createAdminWorkspace.mockRejectedValue({ status: 409, code: "slug_conflict" });
    const response = await POST(writeRequest({ name: "Acme", slug: "acme-team", ownerUserId: "22222222-2222-4222-8222-222222222222" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "slug_conflict" });
    expect(mocks.appendAdminAuditEvent.mock.calls.map(([event]) => event.phase)).toEqual(["ATTEMPT", "FAILURE"]);
  });
});
