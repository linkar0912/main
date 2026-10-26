import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), list: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminRead: mocks.read }));
vi.mock("@/src/lib/admin/audit/repository", () => ({ listAdminAuditEvents: mocks.list }));

const { GET } = await import("./route");

describe("GET /api/admin/audit", () => {
  it("filters by where a change came from and by MCP key", async () => {
    mocks.read.mockResolvedValue({ userId: "owner" });
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });

    const response = await GET(new Request("https://admin.linkar.in/api/admin/audit?origin=mcp&mcpKeyId=mcpkey_1"));

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ origin: "mcp", mcpKeyId: "mcpkey_1" }));
  });
});
