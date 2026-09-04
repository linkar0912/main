import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getServerEnv } from "@/src/lib/env";
import { sharedAuthCookieDomain } from "@/src/lib/auth/cookie-domain";

/**
 * Request-scoped Supabase client. Reads/writes the session via the Next.js
 * cookie store, so it works in Route Handlers (read-write) and Server
 * Components (read-only - setAll is a caught no-op there; proxy.ts refreshes
 * the session for that path instead, per @supabase/ssr's documented pattern).
 */
export async function createSupabaseServerClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();
  const domain = sharedAuthCookieDomain(env);

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    ...(domain ? { cookieOptions: { domain } } : {}),
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
