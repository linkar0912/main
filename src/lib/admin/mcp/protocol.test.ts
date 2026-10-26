import { describe, expect, it, vi } from "vitest";

import { handleMcpMessage, type McpTool } from "./protocol";

vi.mock("@/src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function tool(overrides: Partial<McpTool> = {}): McpTool {
  return {
    name: "get_overview",
    title: "Overview",
    description: "Platform totals.",
    access: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    call: vi.fn(async () => ({ content: [{ type: "text" as const, text: "{}" }] })),
    ...overrides,
  };
}

const server = (tools: McpTool[] = [tool()]) => ({ tools, name: "linkar-admin", version: "1.0.0", instructions: "Use reasons." });

describe("handleMcpMessage", () => {
  it("answers initialize with the client's supported protocol version", async () => {
    const response = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "2" } } }, server());
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "linkar-admin", title: "Linkar owner console", version: "1.0.0" },
        instructions: "Use reasons.",
      },
    });
  });

  it("offers its latest protocol version when the client's is unknown", async () => {
    const response = await handleMcpMessage({ jsonrpc: "2.0", id: "a", method: "initialize", params: { protocolVersion: "2099-01-01" } }, server());
    expect(response).toMatchObject({ result: { protocolVersion: "2025-11-25" } });
  });

  it("answers ping with an empty result", async () => {
    expect(await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "ping" }, server())).toEqual({ jsonrpc: "2.0", id: 2, result: {} });
  });

  it("lists tools without their handlers or access levels", async () => {
    const response = await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, server());
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 3,
      result: {
        tools: [{
          name: "get_overview",
          title: "Overview",
          description: "Platform totals.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { title: "Overview", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        }],
      },
    });
  });

  it("keeps an unlisted tool out of tools/list but still answers a call to it", async () => {
    const call = vi.fn(async () => ({ isError: true, content: [{ type: "text" as const, text: "{\"error\":\"mcp_key_read_only\"}" }] }));
    const hidden = tool({ name: "set_user_access", listed: false, call });
    const listed = await handleMcpMessage({ jsonrpc: "2.0", id: 11, method: "tools/list" }, server([tool(), hidden]));
    expect((listed?.result as { tools: { name: string }[] }).tools.map((entry) => entry.name)).toEqual(["get_overview"]);

    const response = await handleMcpMessage({ jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "set_user_access", arguments: {} } }, server([tool(), hidden]));
    expect(response).toMatchObject({ result: { isError: true } });
    expect(call).toHaveBeenCalledOnce();
  });

  it("calls a tool with its arguments and returns its result", async () => {
    const call = vi.fn(async () => ({ content: [{ type: "text" as const, text: "{\"ok\":true}" }] }));
    const response = await handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_overview", arguments: { limit: 5 } } }, server([tool({ call })]));
    expect(call).toHaveBeenCalledWith({ limit: 5 });
    expect(response).toEqual({ jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: "{\"ok\":true}" }] } });
  });

  it("passes an empty object when a call has no arguments", async () => {
    const call = vi.fn(async () => ({ content: [] }));
    await handleMcpMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_overview" } }, server([tool({ call })]));
    expect(call).toHaveBeenCalledWith({});
  });

  it("rejects an unknown tool as invalid params", async () => {
    const response = await handleMcpMessage({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "drop_database" } }, server());
    expect(response).toEqual({ jsonrpc: "2.0", id: 6, error: { code: -32602, message: "Unknown tool: drop_database" } });
  });

  it("turns a tool that throws into a safe tool error", async () => {
    const call = vi.fn(async () => { throw new Error("connection string postgres://secret"); });
    const response = await handleMcpMessage({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "get_overview", arguments: {} } }, server([tool({ call })]));
    expect(response).toEqual({ jsonrpc: "2.0", id: 7, result: { isError: true, content: [{ type: "text", text: "{\"error\":\"operation_failed\"}" }] } });
  });

  it.each([
    ["a non-object", "hello"],
    ["a message without jsonrpc 2.0", { jsonrpc: "1.0", id: 8, method: "ping" }],
    ["a message without a method", { jsonrpc: "2.0", id: 8 }],
    ["a null id", { jsonrpc: "2.0", id: null, method: "ping" }],
  ])("rejects %s as an invalid request", async (_name, message) => {
    const response = await handleMcpMessage(message, server());
    expect(response).toMatchObject({ jsonrpc: "2.0", error: { code: -32600 } });
  });

  it("rejects an unknown method", async () => {
    expect(await handleMcpMessage({ jsonrpc: "2.0", id: 9, method: "resources/list" }, server())).toEqual({ jsonrpc: "2.0", id: 9, error: { code: -32601, message: "Method not found: resources/list" } });
  });

  it("returns nothing for a notification or a client response", async () => {
    expect(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, server())).toBeNull();
    expect(await handleMcpMessage({ jsonrpc: "2.0", id: 10, result: {} }, server())).toBeNull();
  });
});
