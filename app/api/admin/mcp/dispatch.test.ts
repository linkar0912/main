import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ adminUrl: "https://admin.linkar.in" }) }));

const { callAdminRoute } = await import("./dispatch");

const incoming = new Request("https://admin.linkar.in/api/admin/mcp", {
  method: "POST",
  headers: {
    authorization: `Bearer lkadm_${"A".repeat(43)}`,
    cookie: "sb-session=secret",
    "user-agent": "claude-code/2.1",
    "cf-connecting-ip": "203.0.113.9",
    "x-forwarded-for": "203.0.113.9, 10.0.0.2",
  },
});

describe("callAdminRoute", () => {
  it("builds a write request on the admin origin with the reason, key and JSON body", async () => {
    let seen: { request: Request; params: unknown } | undefined;
    const handler = vi.fn(async (request: Request, context: { params: Promise<{ workspaceId: string }> }) => {
      seen = { request, params: await context.params };
      return Response.json({ data: { paused: 2 } });
    });

    const result = await callAdminRoute(handler, {
      method: "POST",
      route: "/api/admin/workspaces/[workspaceId]/automations/pause",
      params: { workspaceId: "workspace_1/../x" },
      body: { version: 3 },
      write: { reason: "Customer’s spam complaint", idempotencyKey: "mcp-call-key-000001" },
    }, incoming);

    expect(result).toEqual({ ok: true, status: 200, body: { data: { paused: 2 } } });
    const request = seen!.request;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://admin.linkar.in/api/admin/workspaces/workspace_1%2F..%2Fx/automations/pause");
    expect(seen!.params).toEqual({ workspaceId: "workspace_1/../x" });
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(decodeURIComponent(request.headers.get("x-admin-reason")!)).toBe("Customer’s spam complaint");
    expect(request.headers.get("idempotency-key")).toBe("mcp-call-key-000001");
    expect(request.headers.get("user-agent")).toBe("claude-code/2.1");
    expect(request.headers.get("cf-connecting-ip")).toBe("203.0.113.9");
    expect(request.headers.get("authorization")).toBeNull();
    expect(request.headers.get("cookie")).toBeNull();
    expect(await request.json()).toEqual({ version: 3 });
  });

  it("sends reads as GET with a query string and no body", async () => {
    let seen: Request | undefined;
    const handler = vi.fn(async (request: Request) => { seen = request; return Response.json({ data: [] }); });

    await callAdminRoute(handler, { method: "GET", route: "/api/admin/users", query: { search: "a b", limit: 10, cursor: undefined, empty: "" } }, incoming);

    expect(seen!.method).toBe("GET");
    expect(seen!.url).toBe("https://admin.linkar.in/api/admin/users?search=a+b&limit=10");
    expect(seen!.headers.get("content-type")).toBeNull();
    expect(seen!.body).toBeNull();
  });

  it("sends an empty JSON object when a write has no body", async () => {
    let body: unknown;
    const handler = vi.fn(async (request: Request) => { body = await request.json(); return Response.json({ data: {} }); });
    await callAdminRoute(handler, { method: "DELETE", route: "/api/admin/invite-codes/[id]", params: { id: "invite_1" }, write: { reason: "Leaked code", idempotencyKey: "mcp-call-key-000002" } }, incoming);
    expect(body).toEqual({});
  });

  it("returns CSV as text", async () => {
    const handler = vi.fn(async () => new Response("a,b\n1,2\n", { headers: { "content-type": "text/csv; charset=utf-8" } }));
    expect(await callAdminRoute(handler, { method: "POST", route: "/api/admin/audit/export", body: {}, write: { reason: "Quarterly review", idempotencyKey: "mcp-call-key-000003" } }, incoming))
      .toEqual({ ok: true, status: 200, body: "a,b\n1,2\n" });
  });

  it("returns the console's error body with the status", async () => {
    const handler = vi.fn(async () => Response.json({ error: "version_conflict", message: "Reload and try again." }, { status: 409 }));
    expect(await callAdminRoute(handler, { method: "GET", route: "/api/admin/plans" }, incoming))
      .toEqual({ ok: false, status: 409, body: { error: "version_conflict", message: "Reload and try again." } });
  });

  it("refuses a route template whose parameter is missing", async () => {
    const handler = vi.fn();
    await expect(callAdminRoute(handler, { method: "GET", route: "/api/admin/users/[userId]", params: {} }, incoming)).rejects.toThrow("missing route parameter userId");
    expect(handler).not.toHaveBeenCalled();
  });
});
