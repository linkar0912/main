import { getServerEnv } from "@/src/lib/env";

/**
 * Any admin route handler. `Promise<never>` accepts every handler's own
 * RouteContext; the route template and params below keep them consistent.
 */
export type AdminRouteHandler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;

export type AdminRouteMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type AdminRouteCall = {
  method: AdminRouteMethod;
  /** The route's file path, e.g. /api/admin/users/[userId]. */
  route: string;
  params?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  write?: { reason: string; idempotencyKey: string };
};

export type AdminRouteResult = { ok: boolean; status: number; body: unknown };

// Enough for the guard to record the MCP client's network and user agent
// the way it does a browser's. The key, cookies and everything else stay out.
const FORWARDED_HEADERS = ["user-agent", "cf-connecting-ip", "x-forwarded-for", "x-real-ip"] as const;

function routePath(route: string, params: Record<string, string>): string {
  return route.replace(/\[([A-Za-z]+)\]/g, (_segment, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`missing route parameter ${name}`);
    return encodeURIComponent(value);
  });
}

/**
 * Calls an admin route handler in-process, as the console's own fetch would.
 * Inside the call, `headers()` and `cookies()` from next/headers still return
 * the outer MCP request, bearer key included: admin code must read the
 * Request it is handed, never those.
 */
export async function callAdminRoute(handler: AdminRouteHandler, call: AdminRouteCall, incoming: Request): Promise<AdminRouteResult> {
  const params = call.params ?? {};
  const url = new URL(routePath(call.route, params), getServerEnv().adminUrl);
  for (const [name, value] of Object.entries(call.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, String(value));
  }

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = incoming.headers.get(name);
    if (value) headers.set(name, value);
  }
  let body: string | undefined;
  if (call.method !== "GET") {
    headers.set("content-type", "application/json");
    body = JSON.stringify(call.body ?? {});
  }
  if (call.write) {
    headers.set("x-admin-reason", encodeURIComponent(call.write.reason));
    headers.set("idempotency-key", call.write.idempotencyKey);
  }

  const response = await handler(
    new Request(url, { method: call.method, headers, body }),
    { params: Promise.resolve(params) as Promise<never> },
  );
  const text = await response.text();
  let parsed: unknown = text;
  if ((response.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
  }
  return { ok: response.ok, status: response.status, body: parsed };
}
