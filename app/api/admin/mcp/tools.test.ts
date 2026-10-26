import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AdminKeyPrincipal } from "@/src/lib/admin/mcp/principal";

const routeModules = import.meta.glob("../**/route.ts", { eager: true }) as Record<string, Record<string, unknown>>;
const { adminMcpToolCatalog, buildAdminMcpTools } = await import("./tools");
const accessRoute = await import("../users/[userId]/access/route");

const USER = "33333333-3333-4333-8333-333333333333";
const HTTP_METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];
// Owner MFA needs a browser session, and keys are managed only from one.
const SESSION_ONLY_ROUTES = new Set(["/api/admin/security", "/api/admin/mcp", "/api/admin/mcp-keys", "/api/admin/mcp-keys/[id]"]);

const incoming = new Request("https://admin.linkar.in/api/admin/mcp", { method: "POST" });
const principal = (scope: "READ" | "WRITE"): AdminKeyPrincipal => ({
  keyId: "mcpkey_1",
  label: "Laptop",
  scope,
  expiresAt: "2026-11-24T00:00:00.000Z",
  owner: { userId: "11111111-1111-4111-8111-111111111111", email: "owner@linkar.in", sessionId: "mcp_key:mcpkey_1", aal: "aal2" },
});

const dispatch = vi.fn();
const tools = () => buildAdminMcpTools(incoming, principal("WRITE"), dispatch);
const tool = (name: string) => {
  const found = tools().find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
};
const parsed = (result: { content: { text: string }[] }) => JSON.parse(result.content[0].text);

beforeEach(() => {
  dispatch.mockReset().mockResolvedValue({ ok: true, status: 200, body: { data: { ok: true } } });
});

describe("admin MCP tool catalog", () => {
  it("reaches every admin route handler a key may use", () => {
    const missing: string[] = [];
    for (const [file, module] of Object.entries(routeModules)) {
      const route = new URL(file, "file:///app/api/admin/mcp/").pathname.replace(/^\/app/, "").replace(/\/route\.ts$/, "");
      if (SESSION_ONLY_ROUTES.has(route)) continue;
      for (const method of HTTP_METHODS.filter((name) => typeof module[name] === "function")) {
        const covered = adminMcpToolCatalog.some((spec) => spec.route === route && spec.method === method && spec.handler === module[method]);
        if (!covered) missing.push(`${method} ${route}`);
      }
    }
    expect(Object.keys(routeModules).length).toBeGreaterThan(30);
    expect(missing).toEqual([]);
  });

  it("never reaches a session-only route", () => {
    expect(adminMcpToolCatalog.filter((spec) => spec.route && SESSION_ONLY_ROUTES.has(spec.route))).toEqual([]);
  });

  it("names every tool uniquely in snake case and describes it", () => {
    const names = tools().map((candidate) => candidate.name);
    expect(new Set(names).size).toBe(names.length);
    for (const candidate of tools()) {
      expect(candidate.name).toMatch(/^[a-z][a-z0-9_]{2,63}$/);
      expect(candidate.description.length).toBeGreaterThan(20);
      expect(candidate.title.length).toBeGreaterThan(2);
    }
  });

  it("publishes plain JSON object schemas, with a required reason on every write", () => {
    for (const candidate of tools()) {
      expect(candidate.inputSchema).toMatchObject({ type: "object" });
      expect(candidate.inputSchema).not.toHaveProperty("$schema");
      const required = (candidate.inputSchema.required as string[] | undefined) ?? [];
      const properties = candidate.inputSchema.properties as Record<string, unknown>;
      if (candidate.access === "write") expect(required).toContain("reason");
      else expect(properties).not.toHaveProperty("reason");
      expect(candidate.annotations.readOnlyHint).toBe(candidate.access === "read");
    }
  });

  it("lists only the read tools for a read-only key", () => {
    const listed = buildAdminMcpTools(incoming, principal("READ"), dispatch).filter((candidate) => candidate.listed !== false);
    expect(listed.length).toBeGreaterThan(15);
    expect(listed.every((candidate) => candidate.access === "read")).toBe(true);
    expect(tools().every((candidate) => candidate.listed !== false)).toBe(true);
  });

  it("refuses a write tool called by name with a read-only key, without calling the route", async () => {
    const hidden = buildAdminMcpTools(incoming, principal("READ"), dispatch).find((candidate) => candidate.name === "set_user_access")!;
    const result = await hidden.call({ userId: USER, action: "SUSPEND", reason: "Abuse report 12" });
    expect(result.isError).toBe(true);
    expect(parsed(result)).toMatchObject({ status: 403, error: "mcp_key_read_only" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("marks the irreversible and access-removing tools destructive", () => {
    const destructive = tools().filter((candidate) => candidate.annotations.destructiveHint).map((candidate) => candidate.name);
    expect(destructive).toEqual(expect.arrayContaining(["request_deletion", "request_synthetic_cleanup", "disconnect_integration", "set_user_access", "set_workspace_lifecycle", "remove_workspace_member", "retire_plan", "revoke_invite_code", "end_invite_access", "run_operation_command", "change_deletion_job", "update_user_email", "change_workspace_member", "pause_queue"]));
    expect(destructive).not.toContain("get_user");
  });

  it("marks the tools that email people or call Meta as reaching outside Linkar", () => {
    const openWorld = tools().filter((candidate) => candidate.annotations.openWorldHint).map((candidate) => candidate.name);
    expect(openWorld).toEqual(expect.arrayContaining(["create_user", "send_password_reset", "run_integration_action", "disconnect_integration", "run_operation_command", "retry_failed_queue_jobs"]));
    expect(openWorld).not.toContain("list_plans");
  });
});

describe("admin MCP tool calls", () => {
  it("sends a write to its console route with the reason and a fresh idempotency key", async () => {
    const result = await tool("set_user_access").call({ userId: USER, action: "SUSPEND", reason: "Abuse report 12" });

    expect(dispatch).toHaveBeenCalledWith(accessRoute.POST, {
      method: "POST",
      route: "/api/admin/users/[userId]/access",
      params: { userId: USER },
      body: { action: "SUSPEND" },
      write: { reason: "Abuse report 12", idempotencyKey: expect.stringMatching(/^mcp-[A-Za-z0-9-]{16,}$/) },
    }, incoming);
    expect(result).toEqual({ content: [{ type: "text", text: JSON.stringify({ data: { ok: true } }, null, 2) }] });
  });

  it("uses the caller's idempotency key so a retried call is not run twice", async () => {
    await tool("send_password_reset").call({ userId: USER, reason: "User locked out", idempotencyKey: "retry-safe-key-0001" });
    expect(dispatch.mock.calls[0][1].write).toEqual({ reason: "User locked out", idempotencyKey: "retry-safe-key-0001" });
  });

  it("refuses invalid arguments without calling the route", async () => {
    const result = await tool("set_user_access").call({ userId: "not-a-uuid", action: "SUSPEND" });
    expect(result.isError).toBe(true);
    expect(parsed(result)).toMatchObject({ error: "invalid_arguments" });
    expect(parsed(result).issues.map((issue: { path: string }) => issue.path)).toEqual(expect.arrayContaining(["userId", "reason"]));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses an operation action the resource kind does not support", async () => {
    const result = await tool("run_operation_command").call({ kind: "webhook", id: "wh_1", action: "delete", version: 1, reason: "Clean up" });
    expect(result.isError).toBe(true);
    expect(parsed(result)).toMatchObject({ error: "invalid_arguments", issues: [{ path: "action", message: "webhook accepts: reprocess" }] });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("passes on the console's refusal as a tool error", async () => {
    dispatch.mockResolvedValue({ ok: false, status: 403, body: { error: "owner_workspace_protected" } });
    const result = await tool("get_workspace").call({ workspaceId: "workspace_1" });
    expect(result.isError).toBe(true);
    expect(parsed(result)).toEqual({ status: 403, error: "owner_workspace_protected" });
  });

  it("cuts a result too long for Claude and says where to get the rest", async () => {
    dispatch.mockResolvedValue({ ok: true, status: 200, body: "x".repeat(70_000) });
    const result = await tool("export_workspace").call({ workspaceId: "workspace_1", format: "csv", reason: "Customer data request" });
    expect(result.content[0].text).toHaveLength(60_000);
    expect(result.content[1].text).toContain("first 60,000 of 70,000 characters");
    expect(result.content[1].text).toContain("owner console");
  });

  it("returns CSV exports as text", async () => {
    dispatch.mockResolvedValue({ ok: true, status: 200, body: "id,name\n1,Acme\n" });
    const result = await tool("export_workspace").call({ workspaceId: "workspace_1", format: "csv", reason: "Customer data request" });
    expect(result).toEqual({ content: [{ type: "text", text: "id,name\n1,Acme\n" }] });
  });

  it("maps a two-step deletion onto the console's preview and request routes", async () => {
    await tool("preview_deletion").call({ target: { kind: "WORKSPACE", id: "workspace_1" }, reason: "Closed account" });
    await tool("request_deletion").call({ target: { kind: "WORKSPACE", id: "workspace_1" }, impactDigest: "a".repeat(64), confirmation: "DELETE WORKSPACE workspace_1", challengeToken: "t".repeat(43), reason: "Closed account" });

    expect(dispatch.mock.calls.map(([, call]) => [call.method, call.route, call.body])).toEqual([
      ["POST", "/api/admin/deletions/preview", { target: { kind: "WORKSPACE", id: "workspace_1" } }],
      ["POST", "/api/admin/deletions", { target: { kind: "WORKSPACE", id: "workspace_1" }, impactDigest: "a".repeat(64), confirmation: "DELETE WORKSPACE workspace_1", challengeToken: "t".repeat(43), includeAuthUsers: false }],
    ]);
  });

  it("reads list filters into the query string", async () => {
    await tool("list_operations").call({ kind: "delivery", status: "FAILED", workspaceId: "workspace_1", limit: 50 });
    expect(dispatch.mock.calls[0][1]).toMatchObject({ method: "GET", route: "/api/admin/operations/[kind]", params: { kind: "delivery" }, query: { status: "FAILED", workspaceId: "workspace_1", limit: 50 } });
    expect(dispatch.mock.calls[0][1]).not.toHaveProperty("write");
  });

  it("searches the audit log by MCP key", async () => {
    await tool("search_audit_log").call({ origin: "mcp", mcpKeyId: "mcpkey_9" });
    expect(dispatch.mock.calls[0][1]).toMatchObject({ method: "GET", route: "/api/admin/audit", query: { origin: "mcp", mcpKeyId: "mcpkey_9" } });
  });

  it("tells the caller which key and owner it is acting as", async () => {
    const result = await tool("whoami").call({});
    expect(parsed(result)).toEqual({ keyId: "mcpkey_1", label: "Laptop", scope: "WRITE", expiresAt: "2026-11-24T00:00:00.000Z", owner: { userId: "11111111-1111-4111-8111-111111111111", email: "owner@linkar.in" } });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
