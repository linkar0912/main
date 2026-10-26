import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ authSessionSecret: "test-secret-that-is-at-least-32-characters" }) }));

const { listAdminAuditEvents } = await import("./repository");

function row(overrides: Record<string, unknown> = {}) {
  return { id: "a1", requestId: "admin_req_1", phase: "SUCCESS", actorUserId: "u1", actorEmail: "owner@linkar.in", action: "plan.create", targetType: "plan", targetId: "growth", workspaceId: null, reason: "Launch", before: null, after: null, errorCode: null, origin: "mcp", sessionId: "mcp_key:mcpkey_1", createdAt: new Date("2026-10-25T10:00:00.000Z"), ...overrides };
}

describe("listAdminAuditEvents", () => {
  it("finds what one MCP key did and names the key on each row without exposing session ids", async () => {
    const findMany = vi.fn().mockResolvedValue([row(), row({ id: "a2", origin: "https://admin.linkar.in", sessionId: "6b0d8c1e-browser-session" })]);

    const page = await listAdminAuditEvents({ mcpKeyId: "mcpkey_1", origin: "mcp" }, { adminAuditEvent: { findMany } } as never, "test-secret-that-is-at-least-32-characters");

    expect(findMany.mock.calls[0][0].where).toMatchObject({ sessionId: "mcp_key:mcpkey_1", origin: { contains: "mcp", mode: "insensitive" } });
    expect(page.items.map((item) => item.mcpKeyId)).toEqual(["mcpkey_1", null]);
    for (const item of page.items) expect(item).not.toHaveProperty("sessionId");
  });

  it("does not filter by session without a key", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await listAdminAuditEvents({}, { adminAuditEvent: { findMany } } as never, "test-secret-that-is-at-least-32-characters");
    expect(findMany.mock.calls[0][0].where.sessionId).toBeUndefined();
  });
});
