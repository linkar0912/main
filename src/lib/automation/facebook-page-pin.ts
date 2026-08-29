import type { AutomationRepository } from "../repository";
import { getRepository } from "../repository-provider";

/**
 * Validates a client-supplied Facebook Page pin against the workspace's
 * CONNECTED pages. Same three-bucket contract as resolveInstagramAccountId
 * so the route layer can treat channel pins uniformly:
 * - `undefined` - the client did not ask for a specific page (untouched)
 * - `string`    - a real, CONNECTED `pageId` for this workspace
 * - `null`      - the client asked to pin something that is not a CONNECTED
 *                 page of this workspace (unknown / disconnected / foreign)
 */
export async function resolveFacebookPageId(
  workspaceId: string,
  value: unknown,
  repository: AutomationRepository = getRepository(),
): Promise<string | undefined | null> {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const pages = await repository.listFacebookPages(workspaceId);
  const match = pages.find(
    (page) => page.pageId === value && page.status === "CONNECTED",
  );
  return match ? match.pageId : null;
}
