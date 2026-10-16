import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cookieHeader,
  nextRequestCookies,
  sessionCookies,
  sessionStorageKey,
  staleAndFreshSessions,
  startFakeSupabaseAuth,
  type FakeSupabaseAuth,
} from "@/src/lib/auth/session-cookie-fixtures";

const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
  requestCookies: [] as { name: string; value: string }[],
  cookieHeader: null as string | null,
  setCookie: vi.fn(),
  env: {
    supabaseUrl: "https://example.supabase.co",
    supabasePublishableKey: "sb_publishable_test",
    appUrl: "https://app.linkar.in",
    adminUrl: "https://admin.linkar.in",
    publicSiteUrl: "https://linkar.in",
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => mocks.requestCookies, set: mocks.setCookie }),
  headers: async () => new Headers(mocks.cookieHeader === null ? {} : { cookie: mocks.cookieHeader }),
}));

vi.mock("@/src/lib/env", () => ({ getServerEnv: () => mocks.env }));

vi.mock("@/src/lib/logger", () => ({ logger: { error: mocks.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

// The real client, unless a test swaps in one that cannot reach Supabase Auth.
vi.mock("@/src/lib/supabase/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/supabase/server")>();
  return { ...actual, createSupabaseServerClient: vi.fn(actual.createSupabaseServerClient) };
});

const { POST: logout } = await import("./route");
const { createSupabaseServerClient } = await import("@/src/lib/supabase/server");

// Sign-out with the real request-scoped client and auth-js, against a local
// stand-in for Supabase Auth.
describe("sign-out with a leftover host-only session", () => {
  let fake: FakeSupabaseAuth;
  let storageKey: string;
  const { stale, fresh } = staleAndFreshSessions();
  const SHARED = { appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in", publicSiteUrl: "https://linkar.in" };
  const LOCAL = { appUrl: "http://localhost:3000", adminUrl: "http://localhost:3000", publicSiteUrl: "http://localhost:3000" };

  beforeAll(async () => {
    fake = await startFakeSupabaseAuth({ sessions: [fresh], usedRefreshTokens: [stale.refresh_token] });
    storageKey = sessionStorageKey(fake.url);
    mocks.env.supabaseUrl = fake.url;
  });
  afterAll(async () => {
    await fake.close();
  });
  beforeEach(() => {
    fake.hits.length = 0;
    fake.setLogoutStatus(204);
    mocks.setCookie.mockReset();
    mocks.logError.mockReset();
  });

  function signOut(url: string, origins: typeof SHARED) {
    Object.assign(mocks.env, origins);
    const cookies = [...sessionCookies(storageKey, stale), ...sessionCookies(storageKey, fresh), { name: "theme", value: "dark" }];
    mocks.cookieHeader = cookieHeader(cookies);
    mocks.requestCookies = nextRequestCookies(cookies);
    return logout(new Request(url, { method: "POST", headers: { cookie: mocks.cookieHeader } }));
  }

  const deletions = (response: Response) => response.headers.getSetCookie().filter((cookie) => cookie.startsWith(storageKey) && /max-age=0/i.test(cookie));
  const names = (cookies: string[]) => cookies.map((cookie) => cookie.split("=")[0]).sort();

  it("revokes the fresh session and deletes the session cookies at both scopes", async () => {
    const response = await signOut("https://admin.linkar.in/api/auth/logout", SHARED);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://admin.linkar.in/login?next=%2Fadmin");
    // The session signed out at Supabase is the fresh one, not the stale one.
    expect(fake.refreshPosts()).toEqual([]);
    expect(fake.logouts().map((hit) => hit.authorization)).toEqual([`Bearer ${fresh.access_token}`]);

    const all = [storageKey, `${storageKey}.0`, `${storageKey}.1`];
    const shared = deletions(response).filter((cookie) => /;\s*domain=linkar\.in(;|$)/i.test(cookie));
    const hostOnly = deletions(response).filter((cookie) => !/;\s*domain=/i.test(cookie));
    expect(names(shared)).toEqual(all);
    expect(names(hostOnly)).toEqual(all);
    for (const cookie of hostOnly) expect(cookie).toMatch(/; Secure(;|$)/);
    // Written on the response, not the cookie store: Next folds the store's
    // cookies into the response by name, which would keep only one of the two
    // deletions of each cookie.
    expect(mocks.setCookie).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("theme="))).toBe(false);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("reports a revoke Supabase Auth failed, and still clears the cookies auth-js has already dropped", async () => {
    fake.setLogoutStatus(500);

    const response = await signOut("https://app.linkar.in/api/auth/logout", SHARED);

    expect(fake.logouts().map((hit) => hit.authorization)).toEqual([`Bearer ${fresh.access_token}`]);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.linkar.in/login");
    // auth-js removes the session in this browser even though Supabase Auth
    // did not revoke it, so the cookies go, and the failure is logged.
    expect(names(deletions(response))).toEqual([storageKey, storageKey, `${storageKey}.0`, `${storageKey}.0`, `${storageKey}.1`, `${storageKey}.1`]);
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith("Sign-out could not revoke the session at Supabase Auth", expect.objectContaining({ status: 500, cookiesCleared: true }));
    // Nothing that could replay the session reaches the log.
    const logged = JSON.stringify(mocks.logError.mock.calls);
    for (const secret of [fresh.access_token, fresh.refresh_token, stale.refresh_token]) expect(logged).not.toContain(secret);
  });

  it("deletes nothing, as before, when Supabase Auth could not be reached to read the session", async () => {
    // auth-js returns the error without removing the session, so it asks for
    // no cookie to be deleted.
    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: { signOut: async () => ({ error: new AuthRetryableFetchError("fetch failed", 0) }) },
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);

    const response = await signOut("https://admin.linkar.in/api/auth/logout", SHARED);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://admin.linkar.in/login?next=%2Fadmin");
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: "AuthRetryableFetchError", status: 0, cookiesCleared: false }));
  });

  it("deletes each session cookie once, host-only, in local development", async () => {
    const response = await signOut("http://localhost:3000/api/auth/logout", LOCAL);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    const local = deletions(response);
    expect(names(local)).toEqual([storageKey, `${storageKey}.0`, `${storageKey}.1`]);
    for (const cookie of local) {
      expect(cookie).not.toMatch(/;\s*domain=/i);
      expect(cookie).not.toMatch(/;\s*secure/i);
    }
  });
});
