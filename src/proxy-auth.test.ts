import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { NextRequest } from "next/server";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
