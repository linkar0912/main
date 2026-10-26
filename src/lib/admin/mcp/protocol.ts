import { logger } from "@/src/lib/logger";

/**
 * The JSON-RPC side of a stateless MCP server: one message in, at most one
 * message out. Transport, authentication and the tool catalog live with the
 * route (app/api/admin/mcp).
 */

export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
const LATEST_PROTOCOL_VERSION = SUPPORTED_MCP_PROTOCOL_VERSIONS[0];

export type McpToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  access: "read" | "write";
  /** false keeps the tool out of tools/list; a call to it by name is still answered. */
  listed?: boolean;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  call(args: unknown): Promise<McpToolResult>;
};

export type McpServer = {
  tools: readonly McpTool[];
  name: string;
  version: string;
  instructions: string;
};

type JsonRpcId = string | number;
type JsonRpcResponse = Record<string, unknown>;

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function result(id: JsonRpcId, value: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result: value };
}

function failure(id: JsonRpcId | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function mcpErrorResponse(code: number, message: string): JsonRpcResponse {
  return failure(null, code, message);
}

async function callTool(id: JsonRpcId, params: Record<string, unknown>, server: McpServer): Promise<JsonRpcResponse> {
  const name = params.name;
  if (typeof name !== "string") return failure(id, INVALID_PARAMS, "Tool name required");
  const tool = server.tools.find((candidate) => candidate.name === name);
  if (!tool) return failure(id, INVALID_PARAMS, `Unknown tool: ${name.slice(0, 80)}`);
  const args = params.arguments === undefined ? {} : params.arguments;
  try {
    return result(id, await tool.call(args));
  } catch (error) {
    // Tool failures the console already words come back from tool.call as
    // isError results; anything thrown here is unexpected and stays private.
    logger.error("Admin MCP tool failed", { tool: tool.name, error: error instanceof Error ? error.message : String(error) });
    return result(id, { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "operation_failed" }) }] });
  }
}

export async function handleMcpMessage(message: unknown, server: McpServer): Promise<JsonRpcResponse | null> {
  if (!isRecord(message) || message.jsonrpc !== "2.0") return failure(null, INVALID_REQUEST, "Invalid request");
  const hasId = "id" in message && message.id !== undefined;
  // A response to a server request: this server never sends any, so drop it.
  if (typeof message.method !== "string") {
    if (hasId && ("result" in message || "error" in message)) return null;
    return failure(isId(message.id) ? message.id : null, INVALID_REQUEST, "Invalid request");
  }
  // Notifications (initialized, cancelled) need no answer from a stateless server.
  if (!hasId) return null;
  if (!isId(message.id)) return failure(null, INVALID_REQUEST, "Invalid request id");

  const id = message.id;
  const params = isRecord(message.params) ? message.params : {};
  switch (message.method) {
    case "initialize": {
      const requested = params.protocolVersion;
      const protocolVersion = SUPPORTED_MCP_PROTOCOL_VERSIONS.find((version) => version === requested) ?? LATEST_PROTOCOL_VERSION;
      return result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, title: "Linkar owner console", version: server.version },
        instructions: server.instructions,
      });
    }
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, {
        tools: server.tools.filter((tool) => tool.listed !== false).map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { title: tool.title, ...tool.annotations },
        })),
      });
    case "tools/call":
      return callTool(id, params, server);
    default:
      return failure(id, METHOD_NOT_FOUND, `Method not found: ${message.method.slice(0, 80)}`);
  }
}
