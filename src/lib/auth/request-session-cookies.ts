import { cookies, headers } from "next/headers";
import { sessionCookieSelector, supabaseSessionStorageKey } from "@/src/lib/auth/session-cookie-cleanup";

/**
 * The cookie store for a Server Component or Route Handler, and a getAll for
 * a Supabase client that reads the right session when the browser sent a
 * leftover host-only one beside it (session-cookie-cleanup.ts).
 *
 * Duplicate names survive only in the raw Cookie header, so that is read
 * too. The cookie store stays the source for every other cookie and for
 * cookies written during this request (the proxy's refreshed session, which
 * Next merges into the store but not into the header, or a Route Handler's
 * own write), and getAll reads it on every call so later writes count. The
 * choice between sessions is made once, and again only when the store's
 * session cookies change.
 */
export async function requestSessionCookies(supabaseUrl: string) {
  const cookieStore = await cookies();
  const selectSession = sessionCookieSelector(supabaseSessionStorageKey(supabaseUrl), (await headers()).get("cookie"));
  return {
    cookieStore,
    getAll: () => selectSession(cookieStore.getAll()).cookies,
    // Whom a swapped-in session must belong to (see SessionCookieSelection),
    // as decided from what the browser sent, before anything is written.
    replacedFor: selectSession(cookieStore.getAll()).replacedFor,
  };
}
