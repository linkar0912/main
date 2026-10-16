// Runs the session check with the real @supabase/ssr client and auth-js
// against a local stand-in for Supabase Auth. Nothing here reaches a real
// Supabase project.
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { createServerClient } from "@supabase/ssr";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_CHECK_DEADLINE_MS, SessionCheckDeadlineError, createSessionCheck } from "./session-check";

type TokenAnswer = { status: number; body?: unknown };

/** Answers token refreshes from a queue (the last answer repeats) and counts every request. */
async function startFakeAuth() {
  let answers: TokenAnswer[] = [];
  const hits: { method: string; path: string }[] = [];
  const sockets = new Set<Socket>();
  const server = http.createServer((req, res) => {
    hits.push({ method: req.method ?? "", path: req.url ?? "" });
    req.resume();
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url?.startsWith("/auth/v1/token")) {
      const answer = answers.length > 1 ? answers.shift()! : answers[0] ?? { status: 503 };
      return reply(answer.status, answer.body ?? { message: "upstream unavailable" });
    }
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
    answerRefreshesWith(...next: TokenAnswer[]) {
      answers = next;
    },
    refreshPosts: () => hits.filter((hit) => hit.method === "POST" && hit.path.includes("grant_type=refresh_token")).length,
    close: () => new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}

const USER = { id: "user-1", email: "person@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
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

let fake: Awaited<ReturnType<typeof startFakeAuth>>;

/** A server client holding an expired session, so getClaims() must refresh it first. */
function clientWithExpiredSession(fetch: typeof globalThis.fetch) {
  const exp = nowSeconds() - 60;
  const session = { access_token: accessToken(exp), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "rt-original", user: USER };
  const cookie = { name: "sb-127-auth-token", value: `base64-${b64url(JSON.stringify(session))}` };
  const written: { name: string; value: string }[] = [];
  const client = createServerClient(fake.url, "sb_publishable_test", {
    global: { fetch },
    cookies: { getAll: () => [cookie], setAll: (list) => { written.push(...list); } },
  });
  return { client, written };
}

async function timed<T>(work: Promise<T>) {
  const started = Date.now();
  try {
    return { value: await work, error: undefined, ms: Date.now() - started };
  } catch (error) {
    return { value: undefined, error, ms: Date.now() - started };
  }
}

describe("createSessionCheck against a local Supabase Auth", () => {
  beforeAll(async () => {
    fake = await startFakeAuth();
  });
  afterAll(async () => {
    await fake.close();
  });
  beforeEach(() => {
    fake.hits.length = 0;
  });

  it("gives up after two fast 503s to a token refresh, in under 2 s, and sends no more", async () => {
    fake.answerRefreshesWith({ status: 503 });
    const check = createSessionCheck();
    const { client } = clientWithExpiredSession(check.fetch);

    const result = await timed(check.run(client.auth.getClaims()));

    expect(result.error).toBeInstanceOf(AuthRetryableFetchError);
    expect((result.error as AuthRetryableFetchError).status).toBe(503);
    expect(result.ms).toBeLessThan(2_000);
    expect(fake.refreshPosts()).toBeLessThanOrEqual(2);
    expect(check.signal.aborted).toBe(true);
    // auth-js keeps its retry loop going, but its later attempts are aborted
    // before they reach Supabase.
    await new Promise((resolve) => setTimeout(resolve, 1_700));
    expect(fake.refreshPosts()).toBeLessThanOrEqual(2);
  });

  it("rides out a single 503 blip: auth-js's own retry gets the refreshed session", async () => {
    const refreshed = refreshedSession();
    fake.answerRefreshesWith({ status: 503 }, { status: 200, body: refreshed });
    const check = createSessionCheck();
    const { client, written } = clientWithExpiredSession(check.fetch);

    const result = await timed(check.run(client.auth.getClaims()));

    expect(result.error).toBeUndefined();
    expect(result.value?.error).toBeNull();
    expect(result.value?.data?.claims.sub).toBe(USER.id);
    expect(fake.refreshPosts()).toBe(2);
    expect(check.signal.aborted).toBe(false);
    expect(written.some((cookie) => cookie.name.startsWith("sb-127-auth-token") && cookie.value.length > 0)).toBe(true);
  });

  it("leaves a healthy refresh unchanged", async () => {
    fake.answerRefreshesWith({ status: 200, body: refreshedSession() });
    const check = createSessionCheck();
    const { client, written } = clientWithExpiredSession(check.fetch);

    const result = await timed(check.run(client.auth.getClaims()));

    expect(result.value?.error).toBeNull();
    expect(result.value?.data?.claims.email).toBe(USER.email);
    expect(fake.refreshPosts()).toBe(1);
    expect(check.signal.aborted).toBe(false);
    expect(written.some((cookie) => cookie.name.startsWith("sb-127-auth-token") && cookie.value.length > 0)).toBe(true);
  });

  it("counts only 5xx answers to token refreshes, and only in a row", async () => {
    const check = createSessionCheck();
    const refresh = `${fake.url}/auth/v1/token?grant_type=refresh_token`;

    // Another endpoint failing is not a refresh failure.
    fake.answerRefreshesWith({ status: 503 });
    await check.fetch(`${fake.url}/auth/v1/token?grant_type=password`, { method: "POST" });
    await check.fetch(refresh, { method: "POST" });
    expect(check.signal.aborted).toBe(false);

    // A good answer in between starts the count again.
    fake.answerRefreshesWith({ status: 200, body: refreshedSession() });
    await check.fetch(new URL(refresh), { method: "POST" });
    fake.answerRefreshesWith({ status: 503 });
    await check.fetch(new Request(refresh, { method: "POST" }));
    expect(check.signal.aborted).toBe(false);

    await check.fetch(refresh, { method: "POST" });
    expect(check.signal.aborted).toBe(true);
    await expect(check.run(new Promise(() => undefined))).rejects.toBeInstanceOf(AuthRetryableFetchError);
  });
});

describe("session-check module", () => {
  afterEach(() => {
    vi.doUnmock("next/headers");
    vi.doUnmock("@/src/lib/supabase/server");
    vi.resetModules();
  });

  it("loads without next/headers, so proxy.ts can use it", async () => {
    vi.resetModules();
    const loaded = vi.fn(() => ({}));
    vi.doMock("next/headers", loaded);
    vi.doMock("@/src/lib/supabase/server", loaded);

    const fresh = await import("./session-check");

    expect(typeof fresh.createSessionCheck).toBe("function");
    expect(loaded).not.toHaveBeenCalled();
  });
});

describe("createSessionCheck deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects with SessionCheckDeadlineError after 10 s and aborts the abandoned work", async () => {
    vi.useFakeTimers();
    const check = createSessionCheck();
    let settled = false;
    const pending = check.run(new Promise(() => undefined)).catch((error: unknown) => error).finally(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(SESSION_CHECK_DEADLINE_MS - 1);
    expect(settled).toBe(false);
    expect(check.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toBeInstanceOf(SessionCheckDeadlineError);
    expect(check.signal.aborted).toBe(true);
  });

  it("passes on what the work settles with, and leaves the check running", async () => {
    vi.useFakeTimers();
    const check = createSessionCheck();
    await expect(check.run(Promise.resolve("claims"))).resolves.toBe("claims");
    await expect(check.run(Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    // The deadline timers were cleared, so nothing fires later.
    await vi.advanceTimersByTimeAsync(SESSION_CHECK_DEADLINE_MS * 2);
    expect(check.signal.aborted).toBe(false);
  });
});
