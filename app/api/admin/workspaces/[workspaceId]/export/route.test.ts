import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdminRead: vi.fn(), loadExport: vi.fn(), csv: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminRead: mocks.requireAdminRead }));
vi.mock("@/src/lib/admin/workspace-service", () => ({ loadSafeWorkspaceExport: mocks.loadExport, workspaceExportCsv: mocks.csv }));

const { GET } = await import("./route");
const context = { params: Promise.resolve({ workspaceId: "w1" }) } as never;

describe("workspace export", () => {
  it("returns only the safe export DTO with no-store", async () => {
    mocks.requireAdminRead.mockResolvedValue({ userId: "owner" });
    mocks.loadExport.mockResolvedValue({ id: "w1", name: "Acme", members: [{ email: "member@example.com" }], automations: [], contacts: [] });
    const response = await GET(new Request("https://app.linkar.in/api/admin/workspaces/w1/export?format=json"), context);
    const body = await response.json();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(body)).not.toMatch(/accessToken|password|secret/i);
  });
});
