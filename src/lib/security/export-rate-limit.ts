import { LoginRateLimitStore } from "@/src/lib/auth/rate-limit";
import { getServerEnv } from "@/src/lib/env";

/** CSV exports per workspace per ten minutes, shared by every export route. */
export const EXPORTS_PER_WINDOW = 20;
const EXPORT_WINDOW_MS = 10 * 60 * 1_000;

let limiter: LoginRateLimitStore | undefined;

/**
 * Exports read up to 10,000 rows plus the recent event log in one request.
 * A loop of them is the cheapest way to load the database from a single
 * account, so each workspace gets a generous but finite budget.
 */
export async function consumeWorkspaceExport(workspaceId: string): Promise<boolean> {
  limiter ??= new LoginRateLimitStore(getServerEnv().redisUrl, EXPORTS_PER_WINDOW, EXPORT_WINDOW_MS, "export");
  return limiter.consume(workspaceId);
}

export function exportRateLimitedResponse(): Response {
  return new Response("Too many exports. Try again in a few minutes.", {
    status: 429,
    headers: { "content-type": "text/plain; charset=utf-8", "retry-after": String(EXPORT_WINDOW_MS / 1_000) },
  });
}

/** CSVs carry contact data: never let a shared cache or the back button keep a copy. */
export const PRIVATE_DOWNLOAD_CACHE_CONTROL = "private, no-store";
