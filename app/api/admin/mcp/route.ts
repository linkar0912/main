import { clientAddress } from "@/src/lib/auth/client-address";
import { LoginRateLimitStore, networkRateLimitKey } from "@/src/lib/auth/rate-limit";
import { AdminMcpKeyError, authenticateAdminMcpKey } from "@/src/lib/admin/mcp/keys";
import { runWithAdminKeyPrincipal } from "@/src/lib/admin/mcp/principal";
import { handleMcpMessage, mcpErrorResponse, SUPPORTED_MCP_PROTOCOL_VERSIONS } from "@/src/lib/admin/mcp/protocol";
import { getServerEnv } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";

import { ADMIN_MCP_INSTRUCTIONS, buildAdminMcpTools } from "./tools";

/**
 * The owner console as a stateless Streamable HTTP MCP server: each POST is
 * one JSON-RPC message answered with JSON. There is no event stream and no
 * session, so only POST is exported and Next answers 405 to GET and DELETE.
 * Callers authenticate with an MCP key minted on the Security page; like every
 * admin API route, this one is not behind the proxy's browser session gate.
 */

const SERVER_NAME = "linkar-admin";
const SERVER_VERSION = "1.0.0";
const MAX_BODY_BYTES = 1_000_000;
const FAILURE_LIMIT = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1_000;

let failureLimiter: LoginRateLimitStore | undefined;
function failures(): LoginRateLimitStore {
  failureLimiter ??= new LoginRateLimitStore(getServerEnv().redisUrl, FAILURE_LIMIT, FAILURE_WINDOW_MS, "admin-mcp");
  return failureLimiter;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
}

function bearerToken(header: string | null): string {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? "");
  return match?.[1] ?? "";
}

export async function POST(request: Request): Promise<Response> {
  const env = getServerEnv();
  // DNS rebinding: a web page must never drive this endpoint from a browser.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(env.adminUrl).origin) return json({ error: "origin_not_allowed" }, 403);

  const protocolVersion = request.headers.get("mcp-protocol-version");
  if (protocolVersion && !SUPPORTED_MCP_PROTOCOL_VERSIONS.some((version) => version === protocolVersion)) {
    return json(mcpErrorResponse(-32600, "Unsupported MCP-Protocol-Version"), 400);
  }

  const limiterKey = networkRateLimitKey(env.authSessionSecret, "admin-mcp", clientAddress(request, env.trustedProxyHops));
  if (limiterKey && !(await failures().isAllowed(limiterKey))) return json({ error: "too_many_attempts" }, 429, { "retry-after": String(FAILURE_WINDOW_MS / 1_000) });

  let principal;
  try {
    principal = await authenticateAdminMcpKey(bearerToken(request.headers.get("authorization")));
  } catch (error) {
    if (!(error instanceof AdminMcpKeyError)) {
      logger.error("Admin MCP key check failed", { error: error instanceof Error ? error.message : String(error) });
      return json({ error: "mcp_unavailable" }, 503, { "retry-after": "5" });
    }
    if (limiterKey) await failures().recordFailure(limiterKey);
    return json({ error: error.code }, 401, { "www-authenticate": 'Bearer realm="linkar-admin"' });
  }

  if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "json_required" }, 415);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json({ error: "body_too_large" }, 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return json({ error: "body_too_large" }, 413);

  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return json(mcpErrorResponse(-32700, "Parse error"), 400);
  }
  if (Array.isArray(message)) return json(mcpErrorResponse(-32600, "Batch requests are not supported"), 400);

  if (typeof message === "object" && message !== null && "method" in message && message.method === "tools/call") {
    const params = "params" in message && typeof message.params === "object" && message.params !== null ? message.params as Record<string, unknown> : {};
    logger.info("Admin MCP tool call", { keyId: principal.keyId, tool: typeof params.name === "string" ? params.name.slice(0, 80) : "unknown" });
  }

  const authorized = principal;
  const response = await runWithAdminKeyPrincipal(authorized, () => handleMcpMessage(message, {
    tools: buildAdminMcpTools(request, authorized),
    name: SERVER_NAME,
    version: SERVER_VERSION,
    instructions: ADMIN_MCP_INSTRUCTIONS,
  }));
  if (response === null) return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  return json(response);
}
