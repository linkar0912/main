import type { AutomationRepository } from "../repository";
import { getRepository } from "../repository-provider";

/**
 * Validates a client-supplied account pin against the workspace's CONNECTED
 * Instagram connections. Three buckets:
 * - `undefined` - the client did not ask for a specific account (untouched)
 * - `string`    - a real, CONNECTED `igUserId` for this workspace
 * - `null`      - the client asked to pin something that is not a CONNECTED
 *                 connection of this workspace (unknown / disconnected / foreign)
 *
 * The same contract is used by the create and update routes; keeping it in one
 * place prevents the two handlers from disagreeing on what counts as a valid
 * pin.
 */
export async function resolveInstagramAccountId(
  workspaceId: string,
  value: unknown,
  repository: AutomationRepository = getRepository(),
): Promise<string | undefined | null> {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const connections = await repository.listConnections(workspaceId);
  const match = connections.find(
    (connection) => connection.igUserId === value && connection.status === "CONNECTED",
  );
  return match ? match.igUserId : null;
}
