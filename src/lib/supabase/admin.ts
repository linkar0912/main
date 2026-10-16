import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/src/lib/env";

/** Same per-call cap as the request clients in ./server.ts. */
const ADMIN_FETCH_TIMEOUT_MS = 8_000;

/**
 * Gives up on one Supabase call after ADMIN_FETCH_TIMEOUT_MS while keeping any
 * signal the caller passed. This mirrors supabaseFetchWithTimeout in
 * ./server.ts instead of importing it: the worker bundles this file, and
 * server.ts pulls in next/headers.
 */
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(ADMIN_FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
}

/**
 * Service-role client - bypasses RLS and can manage users (admin.*). Never
 * import this from client code; it must only run on the server.
 */
export function createSupabaseAdminClient() {
  const env = getServerEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  });
}
