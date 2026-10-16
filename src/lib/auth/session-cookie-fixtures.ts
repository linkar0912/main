/**
 * Test fixtures only: Supabase session cookies as @supabase/ssr writes them,
 * and a local stand-in for Supabase Auth. Nothing here reaches a real
 * Supabase project, and no application code imports this module.
 */
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";

const b64url = (value: string) => Buffer.from(value).toString("base64url");

/** @supabase/ssr's default chunk size (MAX_CHUNK_SIZE in its chunker). */
const CHUNK_SIZE = 3180;

export function sessionStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

export type FakeSession = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: { id: string; aud: string; role: string; email: string; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> };
};

/**
 * A session for `userId`. The access token is an unsigned HS256-style JWT, so
 * auth-js's getClaims() asks the fake server's /user endpoint to vouch for it.
 * `padding` grows the session so @supabase/ssr has to split it into chunks.
 */
export function fakeSession(options: { userId: string; email: string; refreshToken: string; expiresAt: number; padding?: number }): FakeSession {
  const { userId, email, refreshToken, expiresAt, padding = 0 } = options;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: userId, email, aud: "authenticated", role: "authenticated", exp: expiresAt, iat: expiresAt - 3600, session_id: `session-${refreshToken}` }));
  return {
    access_token: `${header}.${payload}.c2ln`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: refreshToken,
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email,
      app_metadata: { provider: "email" },
      user_metadata: padding ? { note: "x".repeat(padding) } : {},
    },
  };
}

/** The cookie value @supabase/ssr writes for a session (cookieEncoding "base64url"). */
export function encodeSessionCookie(session: unknown): string {
  return `base64-${b64url(JSON.stringify(session))}`;
}

/**
 * The cookies @supabase/ssr writes for a session: one unchunked cookie when
 * the value fits, otherwise `key.0`, `key.1`, ... The base64url value is
 * URL-safe, so splitting by length matches its chunker.
 */
export function sessionCookies(storageKey: string, session: unknown): { name: string; value: string }[] {
  const value = encodeSessionCookie(session);
  if (value.length <= CHUNK_SIZE) return [{ name: storageKey, value }];
  const chunks: { name: string; value: string }[] = [];
  for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
    chunks.push({ name: `${storageKey}.${chunks.length}`, value: value.slice(offset, offset + CHUNK_SIZE) });
  }
  return chunks;
}

export function cookieHeader(cookies: { name: string; value: string }[]): string {
  return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
}

/** What Next's RequestCookies keeps from a Cookie header: one value per name, the last one. */
export function nextRequestCookies(cookies: { name: string; value: string }[]): { name: string; value: string }[] {
  const byName = new Map<string, { name: string; value: string }>();
  for (const cookie of cookies) byName.set(cookie.name, { name: cookie.name, value: cookie.value });
  return [...byName.values()];
}

type Hit = { method: string; path: string; authorization: string | null; body: string };

/**
 * A local stand-in for Supabase Auth:
 * - POST /auth/v1/token?grant_type=refresh_token answers 400
 *   refresh_token_already_used for a token in `usedRefreshTokens`, as Supabase
 *   does once a refresh token has been rotated, and rotates a token in
 *   `rotations` into the session it maps to;
 * - GET /auth/v1/user vouches for the access tokens of `sessions` and of the
 *   sessions in `rotations`;
 * - POST /auth/v1/logout answers 204, or the status set with setLogoutStatus.
 */
export async function startFakeSupabaseAuth(options: { sessions: FakeSession[]; usedRefreshTokens: string[]; rotations?: Record<string, FakeSession> }) {
  const rotations = options.rotations ?? {};
  let logoutStatus = 204;
  const hits: Hit[] = [];
  const sockets = new Set<Socket>();
  const server = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => { body += chunk; });
    req.on("end", () => {
      const path = req.url ?? "";
      const authorization = req.headers.authorization ?? null;
      hits.push({ method: req.method ?? "", path, authorization, body });
      const answer = (status: number, json?: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(json === undefined ? "" : JSON.stringify(json));
      };
      if (req.method === "POST" && path.startsWith("/auth/v1/token")) {
        let refreshToken: unknown;
        try {
          refreshToken = (JSON.parse(body) as { refresh_token?: unknown }).refresh_token;
        } catch {
          refreshToken = undefined;
        }
        if (typeof refreshToken === "string" && options.usedRefreshTokens.includes(refreshToken)) {
          return answer(400, { code: 400, error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" });
        }
        if (typeof refreshToken === "string" && Object.hasOwn(rotations, refreshToken)) return answer(200, rotations[refreshToken]);
        return answer(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
      }
      if (req.method === "GET" && path.startsWith("/auth/v1/user")) {
        const session = [...options.sessions, ...Object.values(rotations)].find((candidate) => authorization === `Bearer ${candidate.access_token}`);
        return session ? answer(200, session.user) : answer(403, { code: 403, error_code: "bad_jwt", msg: "invalid JWT" });
      }
      if (req.method === "POST" && path.startsWith("/auth/v1/logout")) {
        return logoutStatus === 204 ? answer(204) : answer(logoutStatus, { code: logoutStatus, error_code: "unexpected_failure", msg: "Unexpected failure" });
      }
      return answer(404, {});
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    hits,
    refreshPosts: () => hits.filter((hit) => hit.method === "POST" && hit.path.includes("grant_type=refresh_token")),
    userLookups: () => hits.filter((hit) => hit.method === "GET" && hit.path.startsWith("/auth/v1/user")),
    logouts: () => hits.filter((hit) => hit.method === "POST" && hit.path.startsWith("/auth/v1/logout")),
    setLogoutStatus: (status: number) => { logoutStatus = status; },
    close: () => new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}

export type FakeSupabaseAuth = Awaited<ReturnType<typeof startFakeSupabaseAuth>>;

/**
 * The production failure: a host-only session left from before the cookies
 * moved to Domain=linkar.in (unchunked, expired, refresh token already used),
 * beside a fresh shared session that is big enough to be chunked.
 */
export function staleAndFreshSessions(now = Math.floor(Date.now() / 1000)) {
  const stale = fakeSession({ userId: "owner-user-id", email: "owner@example.com", refreshToken: "rt-stale-used", expiresAt: now - 30 * 24 * 3600 });
  const fresh = fakeSession({ userId: "owner-user-id", email: "owner@example.com", refreshToken: "rt-fresh", expiresAt: now + 3600, padding: 3000 });
  return { stale, fresh };
}
