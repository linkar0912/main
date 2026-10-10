import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdminWrite: vi.fn(), loadExport: vi.fn(), csv: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminWrite: mocks.requireAdminWrite }));
vi.mock("@/src/lib/admin/workspace-service", () => ({ loadSafeWorkspaceExport: mocks.loadExport, workspaceExportCsv: mocks.csv }));
vi.mock("@/src/lib/admin/audit", () => ({ appendAdminAuditEvent: mocks.audit }));

const { POST } = await import("./route");
const context = { params: Promise.resolve({ workspaceId: "w1" }) } as never;
const guard = { owner: { userId: "owner", email: "owner@linkar.in", sessionId: "s", aal: "aal2" }, action: "workspace.export", targetType: "workspace", targetId: "w1", workspaceId: "w1", reason: "Customer data request", idempotencyKey: "workspace-export-0001", requestId: "r", origin: "https://app.linkar.in", ipHash: "h", userAgent: "test" };
const exportData = { id: "w1", name: "Acme", members: [{ email: "member@example.com" }], automations: [], contacts: [{ id: "c1" }] };

function exportRequest(body: unknown) {
  return new Request("https://app.linkar.in/api/admin/workspaces/w1/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("workspace export", () => {
  beforeEach(() => {
    mocks.requireAdminWrite.mockReset().mockResolvedValue(guard);
    mocks.loadExport.mockReset().mockResolvedValue(exportData);
    mocks.csv.mockReset().mockReturnValue("type,id\n");
    mocks.audit.mockReset().mockResolvedValue(undefined);
  });

  it("returns only the safe export DTO with no-store and records counts, not rows, in the audit", async () => {
    const response = await POST(exportRequest({ format: "json" }), context);
    const body = await response.json();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(body)).not.toMatch(/accessToken|password|secret/i);
    expect(mocks.audit.mock.calls.map(([event]) => event.phase)).toEqual(["ATTEMPT", "SUCCESS"]);
    expect(mocks.audit.mock.calls[1][0].after).toEqual({ format: "json", members: 1, automations: 0, contacts: 1 });
  });

  it("requires the audited write guard (reason, origin) before loading data", async () => {
    mocks.requireAdminWrite.mockRejectedValue({ status: 422, code: "reason_required" });
    const response = await POST(exportRequest({ format: "csv" }), context);
    expect(response.status).toBe(422);
    expect(mocks.loadExport).not.toHaveBeenCalled();
  });

  it("reports an oversized workspace without streaming it", async () => {
    mocks.loadExport.mockRejectedValue({ status: 422, code: "export_too_large" });
    const response = await POST(exportRequest({ format: "csv" }), context);
    expect(await response.json()).toEqual({ error: "export_too_large" });
    expect(mocks.audit.mock.calls.map(([event]) => event.phase)).toEqual(["ATTEMPT", "FAILURE"]);
  });
});
