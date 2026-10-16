import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { NextRequest } from "next/server";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieHeader, encodeSessionCookie, fakeSession, sessionCookies, sessionStorageKey, staleAndFreshSessions, startFakeSupabaseAuth, type FakeSupabaseAuth } from "@/src/lib/auth/session-cookie-fixtures";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  createServerClient: vi.fn(),
  assertApplicationAccess: vi.fn(),
  getServerEnv: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/src/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/auth/session")>("@/src/lib/auth/session");
  return {
    ...actual,
    assertApplicationAccess: mocks.assertApplicationAccess,
  };
});

vi.mock("@/src/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

vi.mock("@/src/lib/logger", () => ({
  logger: { error: mocks.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { proxy } from "../proxy";

describe("proxy authentication boundaries", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.createServerClient.mockReset().mockReturnValue({ auth: { getClaims: mocks.getClaims } });
    mocks.assertApplicationAccess.mockReset();
    mocks.logError.mockReset();
    mocks.getServerEnv.mockReset().mockReturnValue({
      adminUrl: "https://admin.linkar.in",
      appUrl: "https://app.linkar.in",
      publicSiteUrl: "https://linkar.in",
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "publishable-key",
    });
  });

  it("lets an authenticated platform owner reach admin routes without workspace access", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "owner-user-id", email: "owner@example.com" } },
      error: null,
    });
    mocks.assertApplicationAccess.mockResolvedValue(null);

    const result = await proxy(new NextRequest("https://admin.linkar.in/admin"));

    expect(result.status).toBe(200);
    expect(result.headers.get("location")).toBeNull();
    expect(mocks.assertApplicationAccess).not.toHaveBeenCalled();
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "publishable-key",
      expect.objectContaining({ cookieOptions: { domain: "linkar.in", path: "/", httpOnly: true, secure: true, sameSite: "lax" } }),
    );
  });

  it("rejects cross-site state-changing API calls but lets same-origin and provider callbacks through", async () => {
    const crossSite = await proxy(new NextRequest("https://app.linkar.in/api/automations", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }));
    expect(crossSite.status).toBe(403);

    const sibling = await proxy(new NextRequest("https://app.linkar.in/api/broadcasts", { method: "POST", headers: { origin: "https://blog.linkar.in", "sec-fetch-site": "same-site" } }));
    expect(sibling.status).toBe(403);

    const sameOrigin = await proxy(new NextRequest("https://app.linkar.in/api/automations", { method: "POST", headers: { origin: "https://app.linkar.in", "sec-fetch-site": "same-origin" } }));
    expect(sameOrigin.status).toBe(200);

    const read = await proxy(new NextRequest("https://app.linkar.in/api/automations", { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }));
    expect(read.status).toBe(200);

    const webhook = await proxy(new NextRequest("https://app.linkar.in/api/razorpay/webhook", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }));
    expect(webhook.status).toBe(200);
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });

  it("answers design preview routes with a real 404 outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const path of ["/dev-preview", "/dev-preview/admin", "/dev-preview/workspace/dashboard"]) {
      const result = await proxy(new NextRequest(`https://app.linkar.in${path}`));
      expect(result.status).toBe(404);
    }
    expect(mocks.getClaims).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

const VALID_CLAIMS = {
  data: { claims: { sub: "user-1", email: "person@example.com", iat: 1_700_000_000 } },
  error: null,
};

function documentRequest(url: string): NextRequest {
  return new NextRequest(url, { headers: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", accept: "text/html" } });
}

// A client-side navigation or prefetch: Next strips its RSC headers before
// Proxy runs, so all that is left is a fetch() with sec-fetch-dest "empty".
function routerRequest(url: string): NextRequest {
  return new NextRequest(url, { headers: { "sec-fetch-dest": "empty", "sec-fetch-mode": "cors", accept: "*/*" } });
}

function poolTimeout(): Error {
  return Object.assign(new Error("Timed out fetching a new connection from the connection pool."), { code: "P2024" });
}

describe("proxy session gate when a dependency fails", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.createServerClient.mockReset().mockReturnValue({ auth: { getClaims: mocks.getClaims } });
    mocks.assertApplicationAccess.mockReset();
    mocks.logError.mockReset();
    mocks.getServerEnv.mockReset().mockReturnValue({
      adminUrl: "https://admin.linkar.in",
      appUrl: "https://app.linkar.in",
      publicSiteUrl: "https://linkar.in",
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "publishable-key",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives the proxy's Supabase client a fetch that times out", async () => {
    mocks.getClaims.mockResolvedValue(VALID_CLAIMS);
    mocks.assertApplicationAccess.mockResolvedValue({ workspaceId: "workspace-1", email: "person@example.com" });

    const result = await proxy(documentRequest("https://app.linkar.in/dashboard"));

    expect(result.status).toBe(200);
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "publishable-key",
      expect.objectContaining({ global: { fetch: expect.any(Function) } }),
    );
  });

  it("answers 503, not a login redirect, when the access check hits a database pool timeout", async () => {
    mocks.getClaims.mockImplementation(async () => {
      // A token refresh during the check writes new session cookies.
      const options = mocks.createServerClient.mock.calls[0][2];
      options.cookies.setAll([{ name: "sb-session", value: "refreshed", options: { path: "/", httpOnly: true } }]);
      return VALID_CLAIMS;
    });
    mocks.assertApplicationAccess.mockRejectedValue(poolTimeout());

    const result = await proxy(documentRequest("https://app.linkar.in/dashboard"));

    expect(result.status).toBe(503);
    expect(result.headers.get("location")).toBeNull();
    expect(result.headers.get("retry-after")).toBe("5");
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("content-type")).toContain("text/html");
    await expect(result.text()).resolves.toContain("Try again");
    // The refreshed cookies still reach the browser, so the rotated refresh
    // token is not lost and the person stays signed in.
    expect(result.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.stringContaining("could not check the session"),
      expect.objectContaining({ stage: "access", path: "/dashboard", code: "P2024" }),
    );
  });

  it("answers a client-side navigation or prefetch with an empty 503", async () => {
    mocks.getClaims.mockResolvedValue(VALID_CLAIMS);
    mocks.assertApplicationAccess.mockRejectedValue(poolTimeout());

    const result = await proxy(routerRequest("https://app.linkar.in/contacts"));

    expect(result.status).toBe(503);
    expect(result.headers.get("location")).toBeNull();
    expect(result.headers.get("retry-after")).toBe("5");
    await expect(result.text()).resolves.toBe("");
  });

  it("answers 503 when the session check outlives its 10 s deadline, and cancels the abandoned work", async () => {
    vi.useFakeTimers();
    mocks.getClaims.mockReturnValue(new Promise(() => undefined));

    let settled = false;
    const pending = proxy(documentRequest("https://app.linkar.in/dashboard")).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result.status).toBe(503);
    expect(result.headers.get("location")).toBeNull();
    expect(result.headers.get("retry-after")).toBe("5");
    expect(mocks.assertApplicationAccess).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ stage: "claims" }));
    // Later refresh attempts by the abandoned check fail at once instead of
    // reaching Supabase.
    const { fetch: timedFetch } = mocks.createServerClient.mock.calls[0][2].global;
    await expect(timedFetch("https://example.supabase.co/auth/v1/token")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("answers 503 when Supabase Auth is unreachable or failing, on the app and the owner console", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("fetch failed", 0) });

    const app = await proxy(documentRequest("https://app.linkar.in/dashboard"));
    expect(app.status).toBe(503);
    expect(app.headers.get("location")).toBeNull();

    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("Service Unavailable", 503) });
    const admin = await proxy(documentRequest("https://admin.linkar.in/admin"));
    expect(admin.status).toBe(503);
    expect(admin.headers.get("location")).toBeNull();
    expect(mocks.assertApplicationAccess).not.toHaveBeenCalled();
  });

  it("still sends a request with no session, a rejected token or no access to /login", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    const noSession = await proxy(documentRequest("https://app.linkar.in/dashboard"));
    expect(noSession.status).toBe(307);
    expect(noSession.headers.get("location")).toBe("https://app.linkar.in/login?next=%2Fdashboard");

    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthSessionMissingError() });
    const missing = await proxy(routerRequest("https://app.linkar.in/contacts"));
    expect(missing.status).toBe(307);
    expect(missing.headers.get("location")).toBe("https://app.linkar.in/login?next=%2Fcontacts");

    mocks.getClaims.mockResolvedValue(VALID_CLAIMS);
    mocks.assertApplicationAccess.mockResolvedValue(null);
    const noAccess = await proxy(documentRequest("https://app.linkar.in/settings"));
    expect(noAccess.status).toBe(307);
    expect(noAccess.headers.get("location")).toBe("https://app.linkar.in/login?next=%2Fsettings");
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("answers a 429 on the token refresh with 503 and does not pass on auth-js's cookie deletion", async () => {
    const rateLimited = new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit");
    mocks.getClaims.mockImplementation(async () => {
      // On a 429 auth-js removes the stored session, which empties its cookies.
      mocks.createServerClient.mock.calls[0][2].cookies.setAll([{ name: "sb-example-auth-token", value: "", options: { path: "/", maxAge: 0 } }]);
      return { data: null, error: rateLimited };
    });

    const result = await proxy(documentRequest("https://app.linkar.in/dashboard"));

    expect(result.status).toBe(503);
    expect(result.headers.get("location")).toBeNull();
    expect(result.headers.get("retry-after")).toBe("5");
    expect(result.headers.getSetCookie()).toEqual([]);
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ stage: "claims", code: "over_request_rate_limit" }));
  });

  it("keeps cookies a refresh set before a 429 later in the check", async () => {
    mocks.getClaims.mockImplementation(async () => {
      mocks.createServerClient.mock.calls[0][2].cookies.setAll([{ name: "sb-example-auth-token", value: "rotated", options: { path: "/", httpOnly: true } }]);
      return { data: null, error: new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit") };
    });

    const result = await proxy(routerRequest("https://app.linkar.in/contacts"));

    expect(result.status).toBe(503);
    expect(result.cookies.get("sb-example-auth-token")?.value).toBe("rotated");
  });
});

// The real @supabase/ssr client and auth-js inside the real proxy, against a
// local stand-in for Supabase Auth that counts requests. Nothing here reaches
// a real Supabase project.
type TokenAnswer = { status: number; body?: unknown };

async function startFakeAuth() {
  let answer: TokenAnswer = { status: 503 };
  const hits: { method: string; path: string }[] = [];
  const sockets = new Set<Socket>();
  const server = http.createServer((req, res) => {
    hits.push({ method: req.method ?? "", path: req.url ?? "" });
    req.resume();
    const status = req.url?.startsWith("/auth/v1/token") ? answer.status : 404;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(req.url?.startsWith("/auth/v1/token") ? answer.body ?? { message: "upstream unavailable" } : {}));
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    hits,
    answerRefreshesWith(next: TokenAnswer) {
      answer = next;
    },
    refreshPosts: () => hits.filter((hit) => hit.method === "POST" && hit.path.includes("grant_type=refresh_token")).length,
    close: () => new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}

/** A document request carrying an @supabase/ssr session cookie whose access token has expired. */
function expiredSessionRequest(supabaseUrl: string): NextRequest {
  const b64url = (value: string) => Buffer.from(value).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) - 60;
  const token = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify({ sub: "user-1", email: "person@example.com", exp }))}.c2ln`;
  const session = { access_token: token, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "rt-original", user: { id: "user-1", email: "person@example.com", aud: "authenticated" } };
  const cookieName = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  return new NextRequest("https://app.linkar.in/dashboard", {
    headers: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", accept: "text/html", cookie: `${cookieName}=base64-${b64url(JSON.stringify(session))}` },
  });
}

describe("proxy session gate against a failing Supabase Auth", () => {
  let fake: Awaited<ReturnType<typeof startFakeAuth>>;

  beforeAll(async () => {
    fake = await startFakeAuth();
  });
  afterAll(async () => {
    await fake.close();
  });
  beforeEach(async () => {
    fake.hits.length = 0;
    const actual = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
    mocks.createServerClient.mockReset().mockImplementation(actual.createServerClient);
    mocks.assertApplicationAccess.mockReset().mockResolvedValue({ workspaceId: "workspace-1", email: "person@example.com" });
    mocks.logError.mockReset();
    mocks.getServerEnv.mockReset().mockReturnValue({
      adminUrl: "https://admin.linkar.in",
      appUrl: "https://app.linkar.in",
      publicSiteUrl: "https://linkar.in",
      supabaseUrl: fake.url,
      supabasePublishableKey: "sb_publishable_test",
    });
  });

  it("answers 503 in under 2 s after at most two refresh attempts when every refresh gets a fast 503", async () => {
    fake.answerRefreshesWith({ status: 503 });
    const started = Date.now();

    const result = await proxy(expiredSessionRequest(fake.url));

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result.status).toBe(503);
    expect(result.headers.get("location")).toBeNull();
    expect(result.headers.get("retry-after")).toBe("5");
    expect(fake.refreshPosts()).toBeLessThanOrEqual(2);
    expect(mocks.assertApplicationAccess).not.toHaveBeenCalled();
  });

  it("answers a 429 on the refresh with 503 and keeps the session cookie", async () => {
    fake.answerRefreshesWith({ status: 429, body: { code: 429, error_code: "over_request_rate_limit", msg: "Request rate limit reached" } });

    const result = await proxy(expiredSessionRequest(fake.url));

    expect(result.status).toBe(503);
    expect(result.headers.get("location")).toBeNull();
    expect(fake.refreshPosts()).toBe(1);
    // No Set-Cookie clears sb-*-auth-token, so the person is not signed out.
    expect(result.headers.getSetCookie().filter((cookie) => /^sb-[^=]*-auth-token[^=]*=/.test(cookie))).toEqual([]);
  });
});

// The production failure on the owner console: the browser still holds a
// host-only session from before the session cookies moved to
// Domain=linkar.in, and sends it beside the fresh shared session. The real
// @supabase/ssr client and auth-js run inside the real proxy against a local
// stand-in for Supabase Auth.
describe("proxy session gate with a leftover host-only session", () => {
  let fake: FakeSupabaseAuth;
  let storageKey: string;
  const { stale, fresh } = staleAndFreshSessions();
  const SHARED_ENV = { adminUrl: "https://admin.linkar.in", appUrl: "https://app.linkar.in", publicSiteUrl: "https://linkar.in" };
  const LOCAL_ENV = { adminUrl: "http://localhost:3000", appUrl: "http://localhost:3000", publicSiteUrl: "http://localhost:3000" };
  const nowSeconds = Math.floor(Date.now() / 1000);
  // An email sign-in small enough for one cookie.
  const unchunked = fakeSession({ userId: "owner-user-id", email: "owner@example.com", refreshToken: "rt-unchunked", expiresAt: nowSeconds + 3000 });
  // A host-only session from before the move whose refresh token was never
  // used, and the session Supabase Auth rotates it into.
  const unused = fakeSession({ userId: "owner-user-id", email: "owner@example.com", refreshToken: "rt-never-used", expiresAt: nowSeconds - 40 * 24 * 3600 });
  const renewed = fakeSession({ userId: "owner-user-id", email: "owner@example.com", refreshToken: "rt-renewed", expiresAt: nowSeconds + 3600, padding: 3000 });

  beforeAll(async () => {
    fake = await startFakeSupabaseAuth({ sessions: [fresh, unchunked], usedRefreshTokens: [stale.refresh_token], rotations: { [unused.refresh_token]: renewed } });
    storageKey = sessionStorageKey(fake.url);
  });
  afterAll(async () => {
    await fake.close();
  });
  // Every cookie write the proxy's Supabase client asks for, including ones a
  // later redirect drops.
  const written: { name: string; value: string }[] = [];

  beforeEach(async () => {
    fake.hits.length = 0;
    written.length = 0;
    const actual = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
    mocks.createServerClient.mockReset().mockImplementation((url: string, key: string, options: Parameters<typeof actual.createServerClient>[2]) => {
      const { getAll, setAll } = options.cookies as { getAll: () => { name: string; value: string }[]; setAll: (cookies: { name: string; value: string; options: object }[]) => void };
      return actual.createServerClient(url, key, {
        ...options,
        cookies: {
          getAll,
          setAll: (cookies) => {
            written.push(...cookies.map(({ name, value }) => ({ name, value })));
            setAll(cookies);
          },
        },
      });
    });
    mocks.assertApplicationAccess.mockReset().mockResolvedValue({ workspaceId: "workspace-1", email: "owner@example.com" });
    mocks.logError.mockReset();
  });

  function useEnv(origins: typeof SHARED_ENV) {
    mocks.getServerEnv.mockReset().mockReturnValue({ ...origins, supabaseUrl: fake.url, supabasePublishableKey: "sb_publishable_test" });
  }

  /** The stale host-only cookie was set first, so the browser sends it first. */
  function conflictingCookies() {
    return [...sessionCookies(storageKey, stale), ...sessionCookies(storageKey, fresh), { name: "theme", value: "dark" }];
  }

  function pageRequest(url: string, cookies: { name: string; value: string }[]): NextRequest {
    return new NextRequest(url, { headers: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", accept: "text/html", cookie: cookieHeader(cookies) } });
  }

  const authCookieHeaders = (response: Response) => response.headers.getSetCookie().filter((cookie) => cookie.startsWith(`${storageKey}`));
  const hostOnlyDeletions = (response: Response) => authCookieHeaders(response).filter((cookie) => !/;\s*domain=/i.test(cookie) && /max-age=0/i.test(cookie));
  const sharedDeletions = (response: Response) => authCookieHeaders(response).filter((cookie) => /;\s*domain=linkar\.in/i.test(cookie) && /max-age=0/i.test(cookie));

  it("lets the owner into the console on the fresh session instead of refreshing the stale one", async () => {
    useEnv(SHARED_ENV);
    const cookies = conflictingCookies();
    expect(cookies.map(({ name }) => name)).toEqual([storageKey, `${storageKey}.0`, `${storageKey}.1`, "theme"]);

    const result = await proxy(pageRequest("https://admin.linkar.in/admin", cookies));

    expect(fake.refreshPosts()).toEqual([]);
    expect(result.status).toBe(200);
    expect(result.headers.get("location")).toBeNull();
    expect(fake.userLookups().map((hit) => hit.authorization)).toEqual([`Bearer ${fresh.access_token}`]);
    // The fresh shared session is left alone: before the fix auth-js refreshed
    // the stale session, got refresh_token_already_used and asked to delete
    // every session cookie, and the gate sent the owner to /login.
    expect(written).toEqual([]);
    expect(sharedDeletions(result)).toEqual([]);
    // ... and the leftover host-only cookies are deleted on this host.
    expect(hostOnlyDeletions(result).map((cookie) => cookie.split("=")[0]).sort()).toEqual([storageKey, `${storageKey}.0`, `${storageKey}.1`]);
    for (const cookie of hostOnlyDeletions(result)) {
      expect(cookie).toMatch(/; Path=\/(;|$)/);
      expect(cookie).toMatch(/; Expires=Thu, 01 Jan 1970 00:00:00 GMT(;|$)/);
      expect(cookie).toMatch(/; HttpOnly(;|$)/);
      expect(cookie).toMatch(/; SameSite=Lax(;|$)/);
      expect(cookie).toMatch(/; Secure(;|$)/);
    }
  });

  it("does the same for a workspace page on the app host", async () => {
    useEnv(SHARED_ENV);

    const result = await proxy(pageRequest("https://app.linkar.in/dashboard", conflictingCookies()));

    expect(fake.refreshPosts()).toEqual([]);
    expect(result.status).toBe(200);
    expect(mocks.assertApplicationAccess).toHaveBeenCalledWith("owner-user-id", "owner@example.com", fresh.expires_at - 3600);
    expect(sharedDeletions(result)).toEqual([]);
    expect(hostOnlyDeletions(result)).toHaveLength(3);
  });

  it("cleans up the leftover when the sign-in page is visited, without asking Supabase", async () => {
    useEnv(SHARED_ENV);

    const result = await proxy(pageRequest("https://admin.linkar.in/login?next=%2Fadmin", conflictingCookies()));

    expect(result.status).toBe(200);
    expect(fake.hits).toEqual([]);
    expect(hostOnlyDeletions(result)).toHaveLength(3);
    expect(sharedDeletions(result)).toEqual([]);
  });

  it("keeps the host-only deletions on the 307 to the owner console and on a 503", async () => {
    useEnv(SHARED_ENV);
    const hop = await proxy(pageRequest("https://app.linkar.in/admin", conflictingCookies()));
    expect(hop.status).toBe(307);
    expect(hop.headers.get("location")).toBe("https://admin.linkar.in/admin");
    expect(hostOnlyDeletions(hop)).toHaveLength(3);

    mocks.assertApplicationAccess.mockRejectedValue(Object.assign(new Error("pool timeout"), { code: "P2024" }));
    const unavailable = await proxy(pageRequest("https://app.linkar.in/dashboard", conflictingCookies()));
    expect(unavailable.status).toBe(503);
    expect(hostOnlyDeletions(unavailable)).toHaveLength(3);
    expect(sharedDeletions(unavailable)).toEqual([]);
  });

  it("deletes the leftover on the /login redirect when no session is usable", async () => {
    useEnv(SHARED_ENV);
    // Only the stale session's cookies, sent twice (host-only and shared), so
    // nothing fresh exists and the person has to sign in.
    const cookies = [...sessionCookies(storageKey, stale), ...sessionCookies(storageKey, stale)];

    const result = await proxy(pageRequest("https://admin.linkar.in/admin", cookies));

    expect(result.status).toBe(307);
    expect(result.headers.get("location")).toBe("https://admin.linkar.in/login?next=%2Fadmin");
    expect(hostOnlyDeletions(result).map((cookie) => cookie.split("=")[0])).toContain(storageKey);
  });

  it("never deletes host-only cookies in local development, where they are the real session", async () => {
    useEnv(LOCAL_ENV);

    const gated = await proxy(pageRequest("http://localhost:3000/admin", conflictingCookies()));
    expect(fake.refreshPosts()).toEqual([]);
    expect(gated.status).toBe(200);
    expect(gated.headers.getSetCookie()).toEqual([]);

    const login = await proxy(pageRequest("http://localhost:3000/login", conflictingCookies()));
    expect(login.headers.getSetCookie()).toEqual([]);
  });

  it("does not touch the cookies of a browser holding only the shared session", async () => {
    useEnv(SHARED_ENV);
    const cookies = [...sessionCookies(storageKey, fresh), { name: "theme", value: "dark" }];

    const gated = await proxy(pageRequest("https://admin.linkar.in/admin", cookies));
    expect(gated.status).toBe(200);
    expect(gated.headers.getSetCookie()).toEqual([]);

    const login = await proxy(pageRequest("https://app.linkar.in/login", cookies));
    expect(login.headers.getSetCookie()).toEqual([]);
  });

  it("does not send host-only deletions from the marketing host itself", async () => {
    useEnv(SHARED_ENV);
    const result = await proxy(pageRequest("https://linkar.in/pricing", conflictingCookies()));
    expect(result.status).toBe(200);
    expect(authCookieHeaders(result)).toEqual([]);
  });

  // Script on a sibling *.linkar.in host can add a Domain=linkar.in session
  // cookie with a longer Path, which the browser sends first, claiming any
  // expiry; it cannot overwrite the HttpOnly one.
  it("keeps a live session when another host adds a session cookie claiming a far-future expiry", async () => {
    useEnv(SHARED_ENV);
    const tossed = fakeSession({ userId: "someone-else", email: "x@example.com", refreshToken: "rt-tossed", expiresAt: 9_999_999_999 });
    expect(sessionCookies(storageKey, unchunked)).toHaveLength(1);

    for (const added of [sessionCookies(storageKey, tossed), [{ name: `${storageKey}.0`, value: encodeSessionCookie(tossed) }]]) {
      fake.hits.length = 0;
      const result = await proxy(pageRequest("https://app.linkar.in/dashboard", [...added, ...sessionCookies(storageKey, unchunked)]));

      expect(result.status).toBe(200);
      expect(fake.userLookups().map((hit) => hit.authorization)).toEqual([`Bearer ${unchunked.access_token}`]);
      expect(fake.refreshPosts()).toEqual([]);
      expect(written).toEqual([]);
      expect(sharedDeletions(result)).toEqual([]);
    }
  });

  it("deletes a leftover that is the only session the browser holds, on the way to /login", async () => {
    useEnv(SHARED_ENV);

    const result = await proxy(pageRequest("https://admin.linkar.in/admin", sessionCookies(storageKey, stale)));

    expect(fake.refreshPosts()).toHaveLength(1);
    expect(result.status).toBe(307);
    expect(result.headers.get("location")).toBe("https://admin.linkar.in/login?next=%2Fadmin");
    // Without this the leftover stays, and every gated request refreshes it
    // with the used token again.
    expect(hostOnlyDeletions(result).map((cookie) => cookie.split("=")[0])).toEqual([storageKey]);
  });

  it("deletes the host-only copy when the session check renews a session the browser held only host-only", async () => {
    useEnv(SHARED_ENV);
    expect(sessionCookies(storageKey, unused)).toHaveLength(1);
    expect(sessionCookies(storageKey, renewed)).toHaveLength(2);

    const result = await proxy(pageRequest("https://app.linkar.in/dashboard", sessionCookies(storageKey, unused)));

    expect(fake.refreshPosts()).toHaveLength(1);
    expect(result.status).toBe(200);
    const sharedWrites = authCookieHeaders(result).filter((cookie) => /;\s*domain=linkar\.in/i.test(cookie) && !/max-age=0/i.test(cookie));
    expect(sharedWrites.map((cookie) => cookie.split("=")[0])).toEqual([`${storageKey}.0`, `${storageKey}.1`]);
    // @supabase/ssr asks for this deletion too, but Next keeps one entry per
    // name and keeps the shared one.
    expect(hostOnlyDeletions(result).map((cookie) => cookie.split("=")[0])).toEqual([storageKey]);
  });

  it("removes a stray chunk at the shared scope and keeps the owner signed in", async () => {
    useEnv(SHARED_ENV);
    const cookies = [...sessionCookies(storageKey, fresh), { name: `${storageKey}.2`, value: "left-over" }];

    const result = await proxy(pageRequest("https://admin.linkar.in/admin", cookies));

    expect(result.status).toBe(200);
    expect(fake.refreshPosts()).toEqual([]);
    expect(sharedDeletions(result).map((cookie) => cookie.split("=")[0])).toEqual([`${storageKey}.2`]);
  });

  it("answers quickly for a crafted 16 KB Cookie header", async () => {
    useEnv(SHARED_ENV);
    const tail = `${"QUFB".repeat(25)}${Buffer.from("aa}").toString("base64url")}`;
    const cookies = [{ name: `${storageKey}.0`, value: `base64-${"eyJh".repeat(2000)}` }];
    while (cookieHeader(cookies).length < 15_500) cookies.push({ name: `${storageKey}.1`, value: tail });
    for (let warmUp = 0; warmUp < 3; warmUp += 1) await proxy(pageRequest("https://app.linkar.in/dashboard", cookies));

    // The fastest of several batches: the rest of a parallel test run can
    // stall any one batch, but not change what a request costs.
    let fastest = Number.POSITIVE_INFINITY;
    for (let batch = 0; batch < 6; batch += 1) {
      const started = performance.now();
      for (let run = 0; run < 4; run += 1) await proxy(pageRequest("https://app.linkar.in/dashboard", cookies));
      fastest = Math.min(fastest, (performance.now() - started) / 4);
    }

    // The old code took about 49 ms a request here; a slower CI machine still stays far below 20.
    expect(fastest).toBeLessThan(20);
  });
});

describe("proxy session gate with a session cookie added from another host", () => {
  // Script on any linkar.in host can add a Domain=linkar.in session cookie
  // with a longer Path, which the browser sends before the person's own. It
  // cannot sign it as someone else, so the user named inside is not trusted
  // until Supabase has verified the session.
  let fake: FakeSupabaseAuth;
  let storageKey: string;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const SHARED_ENV = { adminUrl: "https://admin.linkar.in", appUrl: "https://app.linkar.in", publicSiteUrl: "https://linkar.in" };
  // Back after an hour away: the person's own session needs its refresh.
  const victim = fakeSession({ userId: "victim-id", email: "victim@example.com", refreshToken: "rt-victim", expiresAt: nowSeconds - 600 });
  const victimRenewed = fakeSession({ userId: "victim-id", email: "victim@example.com", refreshToken: "rt-victim-2", expiresAt: nowSeconds + 3600 });
  // The attacker's own real session rotates into the attacker's account.
  const attackerRenewed = fakeSession({ userId: "attacker-id", email: "attacker@example.com", refreshToken: "rt-attacker-2", expiresAt: nowSeconds + 3600 });
  /** The attacker's refresh token inside an unsigned token that claims the victim. */
  const forged = (expiresAt: number) => {
    const session = fakeSession({ userId: "attacker-id", email: "attacker@example.com", refreshToken: "rt-attacker", expiresAt });
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "victim-id", email: "victim@example.com", exp: expiresAt })).toString("base64url");
    return { ...session, access_token: `${header}.${payload}.forged` };
  };
  const written: { name: string; value: string }[] = [];

  beforeAll(async () => {
    fake = await startFakeSupabaseAuth({ sessions: [], usedRefreshTokens: [], rotations: { "rt-victim": victimRenewed, "rt-attacker": attackerRenewed } });
    storageKey = sessionStorageKey(fake.url);
  });
  afterAll(async () => {
    await fake.close();
  });

  beforeEach(async () => {
    fake.hits.length = 0;
    written.length = 0;
    const actual = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
    mocks.createServerClient.mockReset().mockImplementation((url: string, key: string, options: Parameters<typeof actual.createServerClient>[2]) => {
      const { getAll, setAll } = options.cookies as { getAll: () => { name: string; value: string }[]; setAll: (cookies: { name: string; value: string; options: object }[]) => void };
      return actual.createServerClient(url, key, {
        ...options,
        cookies: {
          getAll,
          setAll: (cookies) => {
            written.push(...cookies.map(({ name, value }) => ({ name, value })));
            setAll(cookies);
          },
        },
      });
    });
    mocks.assertApplicationAccess.mockReset().mockImplementation(async (sub: string, email: string) => ({ workspaceId: `workspace-of-${sub}`, email }));
    mocks.logError.mockReset();
    mocks.getServerEnv.mockReset().mockReturnValue({ ...SHARED_ENV, supabaseUrl: fake.url, supabasePublishableKey: "sb_publishable_test" });
  });

  function pageRequest(url: string, cookies: { name: string; value: string }[]): NextRequest {
    return new NextRequest(url, { headers: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", accept: "text/html", cookie: cookieHeader(cookies) } });
  }
  /** Session cookie writes the browser would apply at the shared scope. */
  const sharedSessionWrites = (response: Response) => response.headers.getSetCookie()
    .filter((cookie) => cookie.startsWith(storageKey) && /;\s*domain=linkar\.in/i.test(cookie));

  it("still renews the person's own expired session when nothing was added", async () => {
    const result = await proxy(pageRequest("https://app.linkar.in/dashboard", sessionCookies(storageKey, victim)));

    expect(result.status).toBe(200);
    expect(fake.refreshPosts().map(({ body }) => JSON.parse(body).refresh_token)).toEqual(["rt-victim"]);
  });

  it("never signs the person in to the account whose refresh token was added", async () => {
    // The added cookie is sent first; Next keeps the person's own copy.
    const cookies = [...sessionCookies(storageKey, forged(nowSeconds - 60)), ...sessionCookies(storageKey, victim)];
    const result = await proxy(pageRequest("https://app.linkar.in/dashboard", cookies));

    expect(result.status).toBe(307);
    expect(new URL(result.headers.get("location") ?? "").pathname).toBe("/login");
    expect(mocks.assertApplicationAccess).not.toHaveBeenCalled();
    // The attacker's renewed session never reaches the browser, and the
    // person's own cookie is not overwritten or deleted.
    expect(sharedSessionWrites(result)).toEqual([]);
  });

  it("keeps the person's own cookie when an added session that claims to last for ever fails verification", async () => {
    const cookies = [...sessionCookies(storageKey, forged(9_999_999_999)), ...sessionCookies(storageKey, victim)];
    const result = await proxy(pageRequest("https://admin.linkar.in/admin", cookies));

    expect(result.status).toBe(307);
    expect(new URL(result.headers.get("location") ?? "").pathname).toBe("/login");
    expect(sharedSessionWrites(result)).toEqual([]);
  });
});
