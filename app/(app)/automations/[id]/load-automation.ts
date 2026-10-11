import { cache } from "react";
import { getRequestSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

/**
 * The automation behind /automations/[id] and its tabs, read once per request
 * (React cache) because the shared header layout and the tab page both need it.
 *
 * - `session: false`  no session (the proxy redirects; render nothing specific)
 * - `automation: undefined`  the lookup itself failed: keep a generic header
 * - `automation: null`  no such automation in this workspace (unknown or another
 *   tenant's id): callers 404 rather than render actions for it
 */
export const loadAutomation = cache(async (id: string) => {
  const session = await getRequestSession();
  if (!session) return { session: false as const, automation: undefined };
  const automation = await getRepository().getAutomation(session.workspaceId, id).catch(() => undefined);
  return { session: true as const, automation };
});
