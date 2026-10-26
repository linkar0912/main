import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminKeyPrincipal } from "@/src/lib/admin/mcp/principal";

const TOKEN = `lkadm_${"A".repeat(43)}`;
const principal = (scope: "READ" | "WRITE"): AdminKeyPrincipal => ({
  keyId: "mcpkey_1",
  label: "Laptop",
  scope,
  expiresAt: "2026-11-24T00:00:00.000Z",
  owner: { userId: "11111111-1111-4111-8111-111111111111", email: "owner@linkar.in", sessionId: "mcp_key:mcpkey_1", aal: "aal2" },
});

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), logInfo: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ adminUrl: "https://admin.linkar.in", authSessionSecret: "test-secret-that-is-at-least-32-characters", trustedProxyHops: 1, redisUrl: undefined }) }));
vi.mock("@/src/lib/logger", () => ({ logger: { info: mocks.logInfo, warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/src/lib/admin/mcp/keys", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/admin/mcp/keys")>("@/src/lib/admin/mcp/keys");
  return { ...actual, authenticateAdminMcpKey: mocks.authenticate };
});
vi.mock("./tools", async () => {
  const actual = await vi.importActual<typeof import("./tools")>("./tools");
  return { ...actual, buildAdminMcpTools: vi.fn(actual.buildAdminMcpTools) };
});

const { AdminMcpKeyError } = await import("@/src/lib/admin/mcp/keys");
const { currentAdminKeyPrincipal } = await import("@/src/lib/admin/mcp/principal");
const tools = await import("./tools");
const route = await import("./route");
const { POST } = route;

let address = 0;
function mcpRequest(body: unknown, headers: Record<string, string> = {}): Request {
  address += 1;
  return new Request("https://admin.linkar.in/api/admin/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", accept: "application/json, text/event-stream", "cf-connecting-ip": `203.0.113.${address}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.authenticate.mockReset().mockResolvedValue(principal("WRITE"));
  mocks.logInfo.mockReset();
});

describe("POST /api/admin/mcp", () => {
  it("initializes an MCP session for a valid key", async () => {
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "2" } } }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "linkar-admin" }, capabilities: { tools: { listChanged: false } } });
    expect(body.result.instructions).toContain("reason");
    expect(mocks.authenticate).toHaveBeenCalledWith(TOKEN);
  });

  it.each([
    ["no Authorization header", { authorization: "" }],
    ["a non-Bearer scheme", { authorization: `Basic ${TOKEN}` }],
  ])("answers 401 with a Bearer challenge for %s", async (_name, headers) => {
    mocks.authenticate.mockRejectedValue(new AdminMcpKeyError(401, "invalid_mcp_key"));
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "ping" }, headers));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="linkar-admin"');
    expect(await response.json()).toEqual({ error: "invalid_mcp_key" });
  });

  it("stops answering a network after 10 failed keys in 15 minutes", async () => {
    mocks.authenticate.mockRejectedValue(new AdminMcpKeyError(401, "invalid_mcp_key"));
    const attempt = () => POST(new Request("https://admin.linkar.in/api/admin/mcp", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", "cf-connecting-ip": "198.51.100.77" }, body: "{}" }));
    for (let index = 0; index < 10; index += 1) expect((await attempt()).status).toBe(401);

    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("900");
    expect(mocks.authenticate).toHaveBeenCalledTimes(10);
  });

  it("refuses a browser page on another origin before checking the key", async () => {
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "ping" }, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("accepts the admin origin itself", async () => {
    expect((await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "ping" }, { origin: "https://admin.linkar.in" }))).status).toBe(200);
  });

  it("refuses an unsupported protocol version header", async () => {
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "ping" }, { "mcp-protocol-version": "1999-01-01" }));
    expect(response.status).toBe(400);
  });

  it("requires a JSON body", async () => {
    expect((await POST(mcpRequest("ping", { "content-type": "text/plain" }))).status).toBe(415);
  });

  it("refuses a body over 1 MB", async () => {
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "ping", params: { padding: "x".repeat(1_000_001) } }));
    expect(response.status).toBe(413);
  });

  it("answers invalid JSON with a parse error", async () => {
    const response = await POST(mcpRequest("{not json"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32700 } });
  });

  it("refuses batches", async () => {
    const response = await POST(mcpRequest([{ jsonrpc: "2.0", id: 1, method: "ping" }]));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: -32600 } });
  });

  it("accepts a notification with 202 and no body", async () => {
    const response = await POST(mcpRequest({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("lists only read tools for a read-only key", async () => {
    mocks.authenticate.mockResolvedValue(principal("READ"));
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const names: string[] = (await response.json()).result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain("get_overview");
    expect(names).not.toContain("set_user_access");
    expect(names).not.toContain("request_deletion");
  });

  it("tells a read-only key that a write tool needs a read and write key", async () => {
    mocks.authenticate.mockResolvedValue(principal("READ"));
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "set_user_access", arguments: { userId: "33333333-3333-4333-8333-333333333333", action: "SUSPEND", reason: "Abuse report" } } }));
    const result = (await response.json()).result;
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ status: 403, error: "mcp_key_read_only" });
  });

  it("runs each tool call inside the key's principal and logs which tool ran", async () => {
    vi.mocked(tools.buildAdminMcpTools).mockReturnValueOnce([{
      name: "probe",
      title: "Probe",
      description: "Reports the principal it runs under.",
      access: "read",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      call: async () => ({ content: [{ type: "text", text: currentAdminKeyPrincipal()?.keyId ?? "none" }] }),
    }]);

    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "probe", arguments: {} } }));

    expect((await response.json()).result.content[0].text).toBe("mcpkey_1");
    expect(mocks.logInfo).toHaveBeenCalledWith("Admin MCP tool call", { keyId: "mcpkey_1", tool: "probe" });
    expect(currentAdminKeyPrincipal()).toBeUndefined();
  });
});

describe("other methods on /api/admin/mcp", () => {
  // Next answers 405 with an Allow header for methods a route does not export:
  // there is no event stream to GET and no session to DELETE.
  it("exports only POST", () => {
    expect(Object.keys(route).filter((name) => ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(name))).toEqual([]);
  });
});
