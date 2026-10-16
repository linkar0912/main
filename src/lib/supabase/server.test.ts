import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cookieHeader,
  fakeSession,
  nextRequestCookies,
  sessionCookies,
  sessionStorageKey,
  staleAndFreshSessions,
  startFakeSupabaseAuth,
  type FakeSupabaseAuth,
} from "@/src/lib/auth/session-cookie-fixtures";

const mocks = vi.hoisted(() => ({
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

const { createSupabaseServerClient } = await import("./server");

// The request-scoped client behind the owner console's authorization check,
// sign-out and the auth routes: the real @supabase/ssr client and auth-js
// against a local stand-in for Supabase Auth.
describe("createSupabaseServerClient with a leftover host-only session", () => {
  let fake: FakeSupabaseAuth;
  let storageKey: string;
  const { stale, fresh } = staleAndFreshSessions();
  const unchunked = fakeSession({ userId: "owner-user-id", email: "owner@example.com", refreshToken: "rt-unchunked", expiresAt: Math.floor(Date.now() / 1000) + 3000 });

  beforeAll(async () => {
    fake = await startFakeSupabaseAuth({ sessions: [fresh, unchunked], usedRefreshTokens: [stale.refresh_token] });
    storageKey = sessionStorageKey(fake.url);
    mocks.env.supabaseUrl = fake.url;
  });
  afterAll(async () => {
    await fake.close();
  });
  beforeEach(() => {
    fake.hits.length = 0;
    mocks.setCookie.mockReset();
    mocks.cookieHeader = null;
    mocks.requestCookies = [];
  });

  it("verifies the fresh shared session instead of refreshing the stale host-only one", async () => {
    const cookies = [...sessionCookies(storageKey, stale), ...sessionCookies(storageKey, fresh), { name: "theme", value: "dark" }];
    mocks.cookieHeader = cookieHeader(cookies);
    mocks.requestCookies = nextRequestCookies(cookies);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();

    expect(error).toBeNull();
    expect(data?.claims.sub).toBe("owner-user-id");
    expect(data?.claims.exp).toBe(fresh.expires_at);
    expect(fake.refreshPosts()).toEqual([]);
    // Nothing is deleted: before the fix, auth-js refreshed the stale session,
    // got refresh_token_already_used and deleted every session cookie with
    // Domain=linkar.in, the fresh shared session included.
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("keeps a live session when another host added a session cookie claiming a far-future expiry", async () => {
    // Script on a sibling *.linkar.in host can add a Domain=linkar.in cookie
    // with a longer Path, which the browser sends first.
    const tossed = fakeSession({ userId: "someone-else", email: "x@example.com", refreshToken: "rt-tossed", expiresAt: 9_999_999_999 });
    const cookies = [...sessionCookies(storageKey, tossed), ...sessionCookies(storageKey, unchunked)];
    expect(cookies.map(({ name }) => name)).toEqual([storageKey, storageKey]);
    mocks.cookieHeader = cookieHeader(cookies);
    mocks.requestCookies = nextRequestCookies(cookies);

    const { data, error } = await (await createSupabaseServerClient()).auth.getClaims();

    expect(error).toBeNull();
    expect(data?.claims.sub).toBe("owner-user-id");
    expect(fake.userLookups().map((hit) => hit.authorization)).toEqual([`Bearer ${unchunked.access_token}`]);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("leaves a request with one session exactly as it was", async () => {
    const cookies = [...sessionCookies(storageKey, fresh), { name: "theme", value: "dark" }];
    mocks.cookieHeader = cookieHeader(cookies);
    mocks.requestCookies = nextRequestCookies(cookies);

    const { data } = await (await createSupabaseServerClient()).auth.getClaims();

    expect(data?.claims.sub).toBe("owner-user-id");
    expect(fake.refreshPosts()).toEqual([]);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});
