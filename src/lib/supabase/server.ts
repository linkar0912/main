import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getServerEnv } from "@/src/lib/env";
import { supabaseAuthCookieOptions } from "@/src/lib/auth/cookie-domain";

/**
 * Per-request cap on one Supabase HTTP call. Without it undici waits up to
 * 300 s per attempt and auth-js retries a token refresh for 30 s, so a slow
 * Supabase Auth pins every signed-in request for minutes.
 */
export const SUPABASE_FETCH_TIMEOUT_MS = 8_000;

/**
 * A fetch for Supabase clients that gives up after `timeoutMs`. It keeps any
 * signal the caller passes (auth-js and `signal` here) so an earlier abort
 * still wins. A timeout rejects the fetch, which auth-js reports as an
 * AuthRetryableFetchError instead of hanging.
 */
export function supabaseFetchWithTimeout(timeoutMs = SUPABASE_FETCH_TIMEOUT_MS, signal?: AbortSignal): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (signal) signals.push(signal);
    if (init?.signal) signals.push(init.signal);
    return fetch(input, { ...init, signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals) });
  };
}

/**
 * Request-scoped Supabase client. Reads/writes the session via the Next.js
 * cookie store, so it works in Route Handlers (read-write) and Server
 * Components (read-only - setAll is a caught no-op there; proxy.ts refreshes
 * the session for that path instead, per @supabase/ssr's documented pattern).
 */
export async function createSupabaseServerClient(options: { fetchTimeoutMs?: number } = {}) {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookieOptions: supabaseAuthCookieOptions(env),
    global: { fetch: supabaseFetchWithTimeout(options.fetchTimeoutMs ?? SUPABASE_FETCH_TIMEOUT_MS) },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called during a Server Component render, where the cookie store
          // is read-only.
        }
      },
    },
  });
}
