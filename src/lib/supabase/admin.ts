import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/src/lib/env";

/**
 * Service-role client - bypasses RLS and can manage users (admin.*). Never
 * import this from client code; it must only run on the server.
 */
export function createSupabaseAdminClient() {
  const env = getServerEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
