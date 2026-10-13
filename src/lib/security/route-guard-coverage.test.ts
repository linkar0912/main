import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static check that every route handler under app/ authenticates its caller.
 *
 * Each exported HTTP method in a route.ts must either call one of the guards
 * below (directly, or through a local helper function that does), or be listed
 * in PUBLIC_ROUTES with the reason it is public by design. Adding a new route
 * without a guard fails here instead of shipping as an open endpoint.
 *
 * The guards themselves derive the workspace from the validated session, so a
 * guarded handler never has to trust a client-sent workspace id.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const APP_ROOT = join(REPO_ROOT, "app");
const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

/** Workspace routes: a validated app session (optionally with a role check). */
const SESSION_GUARDS = [
  "getValidatedSession",
  "requireRole",
  "requireManager",
  "requireBillingReader",
  "requireBillingOwner",
];

/** Owner console routes: platform-owner allow-list plus AAL2 (2FA). */
const ADMIN_GUARDS = ["requireAdminRead", "requireAdminWrite", "getPlatformOwnerSession"];

/**
 * Owner console routes allowed to use the AAL1 owner guard: enrolling the
 * second factor has to work before the owner has one.
 */
const ADMIN_AAL1_ROUTES: Record<string, string> = {
  "app/api/admin/security/route.ts": "MFA enrolment runs before AAL2 exists (AAL1 owner identity guards)",
};

/** Routes that are public by design. Every entry needs a reason. */
const PUBLIC_ROUTES: Record<string, string> = {
  // Authentication itself - each one is rate limited and/or proof-bound.
  "app/api/auth/login/route.ts": "sign-in form; per-identity and per-network rate limits",
  "app/api/auth/signup/route.ts": "sign-up form; rate limited",
  "app/api/auth/forgot-password/route.ts": "reset email request; rate limited, no enumeration",
  "app/api/auth/resend-confirmation/route.ts": "confirmation email resend; rate limited",
  "app/api/auth/reset-password/route.ts": "needs the Supabase session plus the signed recovery-proof cookie",
  "app/api/auth/confirm/route.ts": "verifies a Supabase email token_hash",
  "app/api/auth/logout/route.ts": "signs out whatever session the cookie holds",
  "app/api/auth/oauth/facebook/route.ts": "starts the Facebook sign-in relay",
  "app/api/auth/oauth/google/start/route.ts": "starts Google sign-in with a signed state cookie",
  "app/api/auth/oauth/google/callback/route.ts": "checks the signed state cookie and the Google nonce",
  "app/auth/oauth/callback/route.ts": "Supabase PKCE code exchange",
  // Integration OAuth returns: the workspace comes from a signed, expiring
  // state that must equal the state cookie set by the guarded start route.
  "app/api/meta/oauth/callback/route.ts": "HMAC-signed state bound to the state cookie",
  "app/api/facebook/oauth/callback/route.ts": "HMAC-signed state bound to the state cookie",
  // Provider callbacks authenticate with signatures, never a session.
  "app/api/meta/webhook/route.ts": "X-Hub-Signature-256 verified",
  "app/api/facebook/webhook/route.ts": "X-Hub-Signature-256 verified",
  "app/api/meta/deauthorize/route.ts": "Meta signed_request verified",
  "app/api/facebook/deauthorize/route.ts": "Meta signed_request verified",
  "app/api/meta/data-deletion/route.ts": "Meta signed_request verified",
  "app/api/facebook/data-deletion/route.ts": "Meta signed_request verified",
  "app/api/razorpay/webhook/route.ts": "X-Razorpay-Signature verified",
  // Visitor-facing redirects and probes.
  "app/r/[slug]/route.ts": "public tracked-link redirect",
  "app/api/t/[id]/route.ts": "public click redirect; the unguessable participant id is the capability",
  "app/api/health/route.ts": "liveness probe for the container and monitor",
};

function listRouteFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) out.push(...listRouteFiles(full));
    else if (/^route\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Splits a module into its top-level declarations (name -> source text). Good
 * enough for route files, whose declarations all start at column 0.
 */
function topLevelFunctions(source: string): Map<string, string> {
  const starts = [...source.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)|^(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=/gm)];
  const functions = new Map<string, string>();
  starts.forEach((match, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index : source.length;
    functions.set(match[1] ?? match[2], source.slice(match.index, end));
  });
  return functions;
}

function callsAny(body: string, names: readonly string[]): boolean {
  return names.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(body));
}

/** Handlers in `file` that do not reach one of `guards`, directly or via a local helper. */
function unguardedHandlers(source: string, guards: readonly string[]): string[] {
  const functions = topLevelFunctions(source);
  const guarded = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, body] of functions) {
      if (guarded.has(name)) continue;
      if (callsAny(body, guards) || callsAny(body, [...guarded])) {
        guarded.add(name);
        changed = true;
      }
    }
  }
  return HTTP_METHODS.filter((method) => functions.has(method) && !guarded.has(method));
}

function exportedHandlers(source: string): string[] {
  return HTTP_METHODS.filter((method) => topLevelFunctions(source).has(method));
}

const routes = listRouteFiles(APP_ROOT).map((file) => ({
  path: relative(REPO_ROOT, file).split("\\").join("/"),
  source: readFileSync(file, "utf8"),
}));

describe("route handler guard coverage", () => {
  it("finds the route handlers", () => {
    expect(routes.length).toBeGreaterThan(50);
    for (const route of routes) {
      expect(exportedHandlers(route.source), `${route.path} exports no recognisable handler`).not.toEqual([]);
    }
  });

  it("guards every workspace route with a validated session", () => {
    const failures = routes
      .filter((route) => !route.path.startsWith("app/api/admin/") && !(route.path in PUBLIC_ROUTES))
      .flatMap((route) => unguardedHandlers(route.source, SESSION_GUARDS).map((method) => `${method} ${route.path}`));
    expect(failures, "Add a session guard, or list the route in PUBLIC_ROUTES with a reason").toEqual([]);
  });

  it("guards every owner console route with the platform owner + AAL2 guard", () => {
    const failures = routes
      .filter((route) => route.path.startsWith("app/api/admin/"))
      .flatMap((route) => {
        const guards = route.path in ADMIN_AAL1_ROUTES ? [...ADMIN_GUARDS, "requireAdminIdentityWrite", "getPlatformOwnerIdentity"] : ADMIN_GUARDS;
        return unguardedHandlers(route.source, guards).map((method) => `${method} ${route.path}`);
      });
    expect(failures).toEqual([]);
  });

  it("keeps the owner console off the public allow-list", () => {
    expect(Object.keys(PUBLIC_ROUTES).filter((path) => path.startsWith("app/api/admin/"))).toEqual([]);
  });

  it("only allow-lists routes that exist and gives each a reason", () => {
    const paths = new Set(routes.map((route) => route.path));
    for (const [path, reason] of Object.entries({ ...PUBLIC_ROUTES, ...ADMIN_AAL1_ROUTES })) {
      expect(paths.has(path), `${path} is allow-listed but no longer exists`).toBe(true);
      expect(reason.trim().length).toBeGreaterThan(10);
    }
  });

  it("never reads the workspace from the request in a session-guarded route", () => {
    // The session decides the workspace. A body/query workspaceId in a
    // workspace route is the classic cross-tenant hole.
    const offenders = routes
      .filter((route) => !route.path.startsWith("app/api/admin/") && !(route.path in PUBLIC_ROUTES))
      .filter((route) => /(searchParams\.get\(\s*["']workspaceId["']\)|body\??\.workspaceId|data\.workspaceId|form\.get\(\s*["']workspaceId["']\))/.test(route.source))
      .map((route) => route.path);
    expect(offenders).toEqual([]);
  });

  it("catches a handler with no guard (self-check)", () => {
    const source = [
      "async function load(request: Request) {",
      "  return getValidatedSession(request);",
      "}",
      "export async function GET(request: Request) {",
      "  await load(request);",
      "}",
      "export async function DELETE() {",
      "  return new Response(null);",
      "}",
    ].join("\n");
    expect(unguardedHandlers(source, SESSION_GUARDS)).toEqual(["DELETE"]);
  });
});
