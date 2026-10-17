import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_CHECK_DEADLINE_MS } from "@/src/lib/supabase/session-check";
import { cookieHeader, fakeSession, nextRequestCookies, sessionCookies, sessionStorageKey, staleAndFreshSessions, startFakeSupabaseAuth, type FakeSupabaseAuth } from "./session-cookie-fixtures";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  createServerClient: vi.fn(),
  requestCookies: [] as { name: string; value: string }[],
  /** The raw Cookie header; null when a test only sets the cookie store. */
  cookieHeader: null as string | null,
  setCookie: vi.fn(),
  env: {
    supabaseUrl: "https://example.supabase.co",
    supabasePublishableKey: "publishable-key",
    appUrl: "http://localhost:3000",
    adminUrl: "http://localhost:3000",
    publicSiteUrl: "http://localhost:3000",
  },
  findWorkspaceIdByMemberEmail: vi.fn(),
  getSessionAccessSnapshot: vi.fn(),
  bindMemberUserId: vi.fn(),
  getApplicationAccessState: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => mocks.requestCookies, set: mocks.setCookie }),
  headers: async () => new Headers(mocks.cookieHeader === null ? {} : { cookie: mocks.cookieHeader }),
}));

vi.mock("@/src/lib/env", () => ({ getServerEnv: () => mocks.env }));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    findWorkspaceIdByMemberEmail: mocks.findWorkspaceIdByMemberEmail,
    getSessionAccessSnapshot: mocks.getSessionAccessSnapshot,
    bindMemberUserId: mocks.bindMemberUserId,
    getApplicationAccessState: mocks.getApplicationAccessState,
  }),
}));

const { checkRequestSession, checkValidatedSession, getRequestSession, getValidatedSession, safeNextPath } = await import("./session");

/** The options session.ts gave the Supabase server client. */
function clientOptions() {
  return mocks.createServerClient.mock.calls[0][2] as {
    global: { fetch: typeof fetch };
    cookies: { setAll: (cookies: { name: string; value: string; options: Record<string, unknown> }[]) => void };
  };
}

const ACTIVE_MEMBER = {
  workspaceId: "workspace_1",
  email: "member@example.com",
  userStatus: "ACTIVE",
  workspaceStatus: "ACTIVE",
  sessionInvalidBefore: null,
};

beforeEach(() => {
  mocks.createServerClient.mockReset().mockReturnValue({ auth: { getClaims: mocks.getClaims } });
  mocks.requestCookies = [];
  mocks.cookieHeader = null;
  mocks.setCookie.mockReset();
});

describe("getValidatedSession", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.findWorkspaceIdByMemberEmail.mockReset();
    mocks.getSessionAccessSnapshot.mockReset().mockResolvedValue({
      workspaceId: "workspace_1",
      email: "member@example.com",
      userStatus: "ACTIVE",
      workspaceStatus: "ACTIVE",
      sessionInvalidBefore: null,
    });
    mocks.bindMemberUserId.mockReset().mockResolvedValue(true);
    mocks.getApplicationAccessState.mockReset().mockResolvedValue({
      userStatus: "ACTIVE",
      workspaceStatus: "ACTIVE",
      sessionInvalidBefore: null,
    });
  });

  it("resolves a verified session to userId/email/workspaceId", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "member@example.com", iat: 1_788_172_800 } },
      error: null,
    });
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("workspace_1");

    const session = await getValidatedSession(new Request("http://localhost"));

    expect(session).toEqual({ userId: "user_1", email: "member@example.com", workspaceId: "workspace_1" });
    expect(mocks.getSessionAccessSnapshot).toHaveBeenCalledWith("user_1");
    expect(mocks.findWorkspaceIdByMemberEmail).not.toHaveBeenCalled();
  });

  it("returns null when the JWT fails verification", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: { message: "invalid" } });

    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
    expect(mocks.findWorkspaceIdByMemberEmail).not.toHaveBeenCalled();
  });

  it("returns null when the user has no workspace membership", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "orphan@example.com" } },
      error: null,
    });
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue(null);
    mocks.getSessionAccessSnapshot.mockResolvedValue(null);

    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
  });

  it("returns null when the application session hook rejects access", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "member@example.com" } },
      error: null,
    });
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("workspace_1");

    const session = await getValidatedSession(new Request("http://localhost"), {
      validateApplicationSession: async () => false,
    });

    expect(session).toBeNull();
  });

  it.each(["SUSPENDED", "DELETION_PENDING"])("rejects a %s workspace", async (workspaceStatus) => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "member@example.com", iat: 1_788_172_800 } },
      error: null,
    });
    mocks.getSessionAccessSnapshot.mockResolvedValue({
      workspaceId: "workspace_1",
      email: "member@example.com",
      userStatus: "ACTIVE",
      workspaceStatus,
      sessionInvalidBefore: null,
    });

    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
  });

  it("rejects a suspended user", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "member@example.com", iat: 1_788_172_800 } },
      error: null,
    });
    mocks.getSessionAccessSnapshot.mockResolvedValue({
      workspaceId: "workspace_1",
      email: "member@example.com",
      userStatus: "SUSPENDED",
      workspaceStatus: "ACTIVE",
      sessionInvalidBefore: null,
    });

    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
  });

  it("rejects tokens issued before sessionInvalidBefore", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "member@example.com", iat: Math.floor(Date.parse("2026-08-31T09:59:00.000Z") / 1000) } },
      error: null,
    });
    mocks.getSessionAccessSnapshot.mockResolvedValue({
      workspaceId: "workspace_1",
      email: "member@example.com",
      userStatus: "ACTIVE",
      workspaceStatus: "ACTIVE",
      sessionInvalidBefore: "2026-08-31T10:00:00.000Z",
    });

    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
  });

  it("falls back to normalized email once and binds the stable user id", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user_1", email: "Member@Example.com", iat: 1_788_172_800 } },
      error: null,
    });
    mocks.getSessionAccessSnapshot.mockResolvedValue(null);
    mocks.findWorkspaceIdByMemberEmail.mockResolvedValue("workspace_1");

    expect(await getValidatedSession(new Request("http://localhost"))).toMatchObject({ workspaceId: "workspace_1" });
    expect(mocks.bindMemberUserId).toHaveBeenCalledWith("workspace_1", "member@example.com", "user_1");
  });
});

describe("session checks while Supabase Auth is failing", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.getSessionAccessSnapshot.mockReset().mockResolvedValue(ACTIVE_MEMBER);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives the Supabase client the session check's fetch, with the app's cookie settings", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user_1", email: "member@example.com" } }, error: null });

    await getValidatedSession(new Request("http://localhost"));

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "publishable-key",
      expect.objectContaining({
        cookieOptions: expect.objectContaining({ path: "/", httpOnly: true, sameSite: "lax", secure: false }),
        global: { fetch: expect.any(Function) },
      }),
    );
  });

  // A check that hangs (no answer at all) still ends at the deadline, and the
  // deadline cancels auth-js's later attempts, so none can rotate the refresh
  // token after the route has answered.
  it.each([
    ["getValidatedSession", () => getValidatedSession(new Request("http://localhost"))],
    ["getRequestSession", () => getRequestSession()],
  ])("%s answers no session at the 10 s deadline and cancels the client's requests", async (_name, check) => {
    vi.useFakeTimers();
    mocks.getClaims.mockReturnValue(new Promise(() => undefined));

    let settled = false;
    const pending = check().finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(SESSION_CHECK_DEADLINE_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toBeNull();
    expect(mocks.getSessionAccessSnapshot).not.toHaveBeenCalled();
    await expect(clientOptions().global.fetch("https://example.supabase.co/auth/v1/token?grant_type=refresh_token", { method: "POST" }))
      .rejects.toMatchObject({ name: "AbortError" });
  });

  it("answers no session when the check gives up on a failing Auth service", async () => {
    mocks.getClaims.mockRejectedValue(new AuthRetryableFetchError("Supabase Auth answered 503 to a token refresh", 503));
    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();

    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("Service Unavailable", 503) });
    expect(await getValidatedSession(new Request("http://localhost"))).toBeNull();
    expect(mocks.getSessionAccessSnapshot).not.toHaveBeenCalled();
  });

  it("still passes on an unexpected error from the check", async () => {
    mocks.getClaims.mockRejectedValue(new TypeError("not a session error"));
    await expect(getValidatedSession(new Request("http://localhost"))).rejects.toThrow("not a session error");
  });

  it("tells the sign-in page when Supabase Auth could not answer, and only then", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("Service Unavailable", 503) });
    expect(await checkRequestSession()).toEqual({ session: null, authUnavailable: true });

    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit") });
    expect(await checkRequestSession()).toEqual({ session: null, authUnavailable: true });

    mocks.getClaims.mockRejectedValue(new AuthRetryableFetchError("Supabase Auth answered 503 to a token refresh", 503));
    expect(await checkRequestSession()).toEqual({ session: null, authUnavailable: true });

    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    expect(await checkRequestSession()).toEqual({ session: null, authUnavailable: false });

    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthApiError("Invalid Refresh Token: Refresh Token Not Found", 400, "refresh_token_not_found") });
    expect(await checkRequestSession()).toEqual({ session: null, authUnavailable: false });

    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user_1", email: "member@example.com" } }, error: null });
    expect(await checkRequestSession()).toEqual({
      session: { userId: "user_1", email: "member@example.com", workspaceId: "workspace_1" },
      authUnavailable: false,
    });
  });

  // The connect routes send a person back to a "try again shortly" banner
  // instead of the sign-in page when "no session" may only mean Auth is down.
  it("tells a route handler when Supabase Auth could not answer, while getValidatedSession still answers null", async () => {
    const request = new Request("http://localhost");

    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("Service Unavailable", 503) });
    expect(await checkValidatedSession(request)).toEqual({ session: null, authUnavailable: true });
    expect(await getValidatedSession(request)).toBeNull();

    mocks.getClaims.mockRejectedValue(new AuthRetryableFetchError("Supabase Auth answered 503 to a token refresh", 503));
    expect(await checkValidatedSession(request)).toEqual({ session: null, authUnavailable: true });
    expect(await getValidatedSession(request)).toBeNull();

    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit") });
    expect(await checkValidatedSession(request)).toEqual({ session: null, authUnavailable: true });

    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthApiError("Invalid Refresh Token: Refresh Token Not Found", 400, "refresh_token_not_found") });
    expect(await checkValidatedSession(request)).toEqual({ session: null, authUnavailable: false });
    expect(mocks.getSessionAccessSnapshot).not.toHaveBeenCalled();

    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user_1", email: "member@example.com" } }, error: null });
    expect(await checkValidatedSession(request)).toEqual({
      session: { userId: "user_1", email: "member@example.com", workspaceId: "workspace_1" },
      authUnavailable: false,
    });
    expect(await checkValidatedSession(request, { validateApplicationSession: () => false }))
      .toEqual({ session: null, authUnavailable: false });
  });

  it("still resolves the session in a Server Component render, where cookies cannot be written", async () => {
    mocks.setCookie.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
    });
    mocks.getClaims.mockImplementation(async () => {
      clientOptions().cookies.setAll([{ name: "sb-example-auth-token", value: "rotated", options: { path: "/" } }]);
      return { data: { claims: { sub: "user_1", email: "member@example.com" } }, error: null };
    });

    expect(await getRequestSession()).toEqual({ userId: "user_1", email: "member@example.com", workspaceId: "workspace_1" });
    expect(mocks.setCookie).toHaveBeenCalledWith("sb-example-auth-token", "rotated", { path: "/" });
  });
});

// The real @supabase/ssr client and auth-js inside the real session check,
// against a local stand-in for Supabase Auth that counts requests. Nothing
// here reaches a real Supabase project.
type TokenAnswer = { status: number; body?: unknown };

const USER = { id: "user-1", email: "member@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const b64url = (value: string) => Buffer.from(value).toString("base64url");
const nowSeconds = () => Math.floor(Date.now() / 1000);

function accessToken(exp: number): string {
  const claims = { sub: USER.id, email: USER.email, exp, iat: exp - 3600, aud: "authenticated", role: "authenticated" };
  return `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}.${b64url("not-a-real-signature")}`;
}

function refreshedSession() {
  const exp = nowSeconds() + 3600;
  return { access_token: accessToken(exp), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "rt-rotated", user: USER };
}

async function startFakeAuth() {
  let answer: TokenAnswer = { status: 503 };
  const hits: { method: string; path: string }[] = [];
  const sockets = new Set<Socket>();
  const server = http.createServer((req, res) => {
    hits.push({ method: req.method ?? "", path: req.url ?? "" });
    req.resume();
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url?.startsWith("/auth/v1/token")) return reply(answer.status, answer.body ?? { message: "upstream unavailable" });
    // auth-js checks an HS256 token by asking for the user.
    if (req.url?.startsWith("/auth/v1/user")) return reply(200, USER);
    reply(404, {});
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

describe("session checks against a failing Supabase Auth", () => {
  let fake: Awaited<ReturnType<typeof startFakeAuth>>;
  const defaultSupabaseUrl = mocks.env.supabaseUrl;
  const sessionCookieName = "sb-127-auth-token";
  const clearedSessionCookies = () => mocks.setCookie.mock.calls.filter(([name, value]) => String(name).startsWith(sessionCookieName) && value === "");
  const storedSessionCookies = () => mocks.setCookie.mock.calls.filter(([name, value]) => String(name).startsWith(sessionCookieName) && value !== "");

  beforeAll(async () => {
    fake = await startFakeAuth();
    mocks.env.supabaseUrl = fake.url;
  });
  afterAll(async () => {
    mocks.env.supabaseUrl = defaultSupabaseUrl;
    await fake.close();
  });
  beforeEach(async () => {
    fake.hits.length = 0;
    const actual = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
    mocks.createServerClient.mockReset().mockImplementation(actual.createServerClient);
    mocks.getSessionAccessSnapshot.mockReset().mockResolvedValue({ ...ACTIVE_MEMBER, email: USER.email });
    // The request carries a session whose access token has expired, so
    // getClaims() must refresh it first.
    const exp = nowSeconds() - 60;
    const session = { access_token: accessToken(exp), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "rt-original", user: USER };
    mocks.requestCookies = [{ name: sessionCookieName, value: `base64-${b64url(JSON.stringify(session))}` }];
  });

  it.each([
    ["getValidatedSession", () => getValidatedSession(new Request("http://localhost/api/automations"))],
    ["getRequestSession", () => getRequestSession()],
  ])("%s answers no session in under 2 s after at most two refreshes get a fast 503, and sends no more", async (_name, check) => {
    fake.answerRefreshesWith({ status: 503 });
    const started = Date.now();

    const session = await check();

    expect(session).toBeNull();
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(fake.refreshPosts()).toBeLessThanOrEqual(2);
    expect(mocks.getSessionAccessSnapshot).not.toHaveBeenCalled();

    // Supabase Auth recovers just after the route answered. auth-js's retry
    // loop runs on, but its attempts are aborted before they reach Supabase,
    // so none rotates the refresh token into a cookie nobody receives.
    fake.answerRefreshesWith({ status: 200, body: refreshedSession() });
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(fake.refreshPosts()).toBeLessThanOrEqual(2);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("answers no session on a 429 to the refresh, without signing the person out", async () => {
    fake.answerRefreshesWith({ status: 429, body: { code: 429, error_code: "over_request_rate_limit", msg: "Request rate limit reached" } });

    expect(await getValidatedSession(new Request("http://localhost/api/automations"))).toBeNull();
    expect(fake.refreshPosts()).toBe(1);
    // auth-js removed the session, but its cookie deletions were dropped.
    expect(clearedSessionCookies()).toEqual([]);

    expect(await checkRequestSession()).toEqual({ session: null, authUnavailable: true });
    expect(clearedSessionCookies()).toEqual([]);
  });

  it("still signs the person out when Supabase rejects the refresh token", async () => {
    fake.answerRefreshesWith({ status: 400, body: { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" } });

    expect(await checkRequestSession()).toEqual({ session: null, authUnavailable: false });
    expect(clearedSessionCookies().length).toBeGreaterThan(0);
  });

  it("leaves a healthy refresh unchanged and stores the rotated session", async () => {
    fake.answerRefreshesWith({ status: 200, body: refreshedSession() });

    expect(await getValidatedSession(new Request("http://localhost/api/automations"))).toEqual({
      userId: USER.id,
      email: USER.email,
      workspaceId: "workspace_1",
    });
    expect(fake.refreshPosts()).toBe(1);
    expect(storedSessionCookies().length).toBeGreaterThan(0);
    expect(clearedSessionCookies()).toEqual([]);
  });
});

// The production failure: a host-only session left from before the session
// cookies moved to Domain=linkar.in, sent beside the fresh shared session.
// Next keeps one value per cookie name and @supabase/ssr prefers an
// unchunked cookie over chunks, so either can hand auth-js the stale session.
describe("session checks with a leftover host-only session", () => {
  let fake: FakeSupabaseAuth;
  let storageKey: string;
  const defaultSupabaseUrl = mocks.env.supabaseUrl;
  const { stale, fresh } = staleAndFreshSessions();
  const rotated = fakeSession({ userId: "owner-user-id", email: "owner@example.com", refreshToken: "rt-rotated-by-proxy", expiresAt: Math.floor(Date.now() / 1000) + 3600, padding: 3000 });
  const OWNER_SESSION = { userId: "owner-user-id", email: "owner@example.com", workspaceId: "workspace_1" };

  beforeAll(async () => {
    fake = await startFakeSupabaseAuth({ sessions: [fresh, rotated], usedRefreshTokens: [stale.refresh_token] });
    storageKey = sessionStorageKey(fake.url);
    mocks.env.supabaseUrl = fake.url;
  });
  afterAll(async () => {
    mocks.env.supabaseUrl = defaultSupabaseUrl;
    await fake.close();
  });
  beforeEach(async () => {
    fake.hits.length = 0;
    const actual = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
    mocks.createServerClient.mockReset().mockImplementation(actual.createServerClient);
    mocks.getSessionAccessSnapshot.mockReset().mockResolvedValue({ ...ACTIVE_MEMBER, email: "owner@example.com" });
  });

  /** A request whose Cookie header carries `cookies`, as Next presents it. */
  function sendCookies(cookies: { name: string; value: string }[]) {
    mocks.cookieHeader = cookieHeader(cookies);
    mocks.requestCookies = nextRequestCookies(cookies);
  }

  it.each([
    ["getValidatedSession", () => getValidatedSession(new Request("https://admin.linkar.in/api/admin/overview"))],
    ["getRequestSession", () => getRequestSession()],
  ])("%s reads the fresh chunked session, not the stale unchunked one, and deletes nothing", async (_name, check) => {
    sendCookies([...sessionCookies(storageKey, stale), ...sessionCookies(storageKey, fresh)]);

    expect(await check()).toEqual(OWNER_SESSION);
    expect(fake.refreshPosts()).toEqual([]);
    expect(fake.userLookups().map((hit) => hit.authorization)).toEqual([`Bearer ${fresh.access_token}`]);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("reads the fresh session when the stale one has the same cookie names and is sent last", async () => {
    const paddedStale = { ...stale, user: { ...stale.user, user_metadata: { note: "y".repeat(3000) } } };
    const staleCookies = sessionCookies(storageKey, paddedStale);
    const freshCookies = sessionCookies(storageKey, fresh);
    expect(staleCookies.map(({ name }) => name)).toEqual(freshCookies.map(({ name }) => name));
    // Next keeps the last value of each name, which here is the stale one.
    sendCookies([...freshCookies, ...staleCookies]);

    expect(await checkRequestSession()).toEqual({ session: OWNER_SESSION, authUnavailable: false });
    expect(fake.refreshPosts()).toEqual([]);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("reads the session the proxy rotated during this request, which only the cookie store holds", async () => {
    // The browser sent only the stale cookie; the proxy refreshed and set the
    // rotated session, which Next merges into the cookie store but not into
    // the raw Cookie header.
    mocks.cookieHeader = cookieHeader(sessionCookies(storageKey, stale));
    mocks.requestCookies = [...sessionCookies(storageKey, stale), ...sessionCookies(storageKey, rotated)];

    expect(await getRequestSession()).toEqual(OWNER_SESSION);
    expect(fake.refreshPosts()).toEqual([]);
    expect(fake.userLookups().map((hit) => hit.authorization)).toEqual([`Bearer ${rotated.access_token}`]);
  });

  it("still finds the fresh session from the cookie store when there is no Cookie header to read", async () => {
    mocks.requestCookies = [...sessionCookies(storageKey, stale), ...sessionCookies(storageKey, fresh)];

    expect(await getValidatedSession(new Request("https://app.linkar.in/api/automations"))).toEqual(OWNER_SESSION);
    expect(fake.refreshPosts()).toEqual([]);
  });
});

describe("safeNextPath", () => {
  it("rejects external and backslash-based post-login redirects", () => {
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath("/automations?tab=active")).toBe("/automations?tab=active");
  });
});

describe("session checks with a session cookie added from another host", () => {
  // A Domain=linkar.in cookie added by script on another linkar.in host can
  // claim anyone in its unsigned token; only Supabase's verification counts.
  let fake: FakeSupabaseAuth;
  let storageKey: string;
  const defaultSupabaseUrl = mocks.env.supabaseUrl;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const victim = fakeSession({ userId: "victim-id", email: "victim@example.com", refreshToken: "rt-victim", expiresAt: nowSeconds - 600 });
  const victimRenewed = fakeSession({ userId: "victim-id", email: "victim@example.com", refreshToken: "rt-victim-2", expiresAt: nowSeconds + 3600 });
  const attackerRenewed = fakeSession({ userId: "attacker-id", email: "attacker@example.com", refreshToken: "rt-attacker-2", expiresAt: nowSeconds + 3600 });
  const forged = (expiresAt: number) => {
    const session = fakeSession({ userId: "attacker-id", email: "attacker@example.com", refreshToken: "rt-attacker", expiresAt });
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "victim-id", email: "victim@example.com", exp: expiresAt })).toString("base64url");
    return { ...session, access_token: `${header}.${payload}.forged` };
  };

  beforeAll(async () => {
    fake = await startFakeSupabaseAuth({ sessions: [], usedRefreshTokens: [], rotations: { "rt-victim": victimRenewed, "rt-attacker": attackerRenewed } });
    storageKey = sessionStorageKey(fake.url);
    mocks.env.supabaseUrl = fake.url;
  });
  afterAll(async () => {
    mocks.env.supabaseUrl = defaultSupabaseUrl;
    await fake.close();
  });
  beforeEach(async () => {
    fake.hits.length = 0;
    const actual = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
    mocks.createServerClient.mockReset().mockImplementation(actual.createServerClient);
    mocks.getSessionAccessSnapshot.mockReset().mockResolvedValue({ ...ACTIVE_MEMBER, email: "victim@example.com" });
  });

  function sendCookies(cookies: { name: string; value: string }[]) {
    mocks.cookieHeader = cookieHeader(cookies);
    mocks.requestCookies = nextRequestCookies(cookies);
  }

  it.each([
    ["one that renews into another account", () => forged(nowSeconds - 60)],
    ["one that claims to last for ever and fails verification", () => forged(9_999_999_999)],
  ])("answers signed out and writes no cookie for %s", async (_label, added) => {
    // Added first (a longer Path); Next keeps the person's own copy.
    sendCookies([...sessionCookies(storageKey, added()), ...sessionCookies(storageKey, victim)]);

    expect(await getValidatedSession(new Request("https://app.linkar.in/api/contacts"))).toBeNull();
    // Neither the attacker's renewed session nor a deletion of the person's
    // own cookie reaches the browser.
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});
