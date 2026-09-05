import type { SyntheticAccountInventoryItem } from "./synthetic-accounts";
import { isApprovedSyntheticEmail, normalizeSyntheticEmail } from "./synthetic-accounts";

function conflict(code: string): Error {
  return Object.assign(new Error(code), { status: 409, code });
}

export function assertSyntheticCleanupInventory(
  expectedDigest: string,
  current: { digest: string; unsafeOwnedWorkspaceCount: number },
): void {
  if (current.unsafeOwnedWorkspaceCount > 0) throw conflict("shared_test_workspace_requires_review");
  if (current.digest !== expectedDigest) throw conflict("impact_changed");
}

export function canDeleteSyntheticAuthUser(
  stored: SyntheticAccountInventoryItem,
  current: { id: string; email?: string | null },
  protectedUserIds: readonly string[],
): boolean {
  const currentEmail = normalizeSyntheticEmail(current.email ?? "");
  return current.id === stored.userId
    && !protectedUserIds.some((id) => id.toLowerCase() === current.id.toLowerCase())
    && currentEmail === normalizeSyntheticEmail(stored.email)
    && isApprovedSyntheticEmail(currentEmail);
}
