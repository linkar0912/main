import { createHash } from "node:crypto";

const APPROVED_SYNTHETIC_EMAILS = [
  /^owner-[0-9]+@example\.com$/,
  /^member-[0-9]+@example\.com$/,
  /^signout-[0-9]+@example\.com$/,
] as const;

export type SyntheticAccountInventoryItem = {
  userId: string;
  email: string;
  membershipCount: number;
  ownedWorkspaceIds: string[];
};

type AuthUser = { id: string; email?: string | null };
type Membership = { userId: string | null; workspaceId: string; role: string };

export function normalizeSyntheticEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isApprovedSyntheticEmail(value: string): boolean {
  const email = normalizeSyntheticEmail(value);
  return APPROVED_SYNTHETIC_EMAILS.some((pattern) => pattern.test(email));
}

function canonicalAccounts(accounts: readonly SyntheticAccountInventoryItem[]) {
  return [...accounts]
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .map((account) => ({
      userId: account.userId,
      email: normalizeSyntheticEmail(account.email),
      membershipCount: account.membershipCount,
      ownedWorkspaceIds: [...account.ownedWorkspaceIds].sort(),
    }));
}

export function buildSyntheticInventoryDigest(accounts: readonly SyntheticAccountInventoryItem[]): string {
  return createHash("sha256").update(JSON.stringify(canonicalAccounts(accounts))).digest("hex");
}

export async function buildSyntheticAccountInventory(dependencies: {
  listAuthUsersPage: (page: number, perPage: number) => Promise<AuthUser[]>;
  listMemberships: (userIds: string[]) => Promise<Membership[]>;
  platformOwnerUserIds: readonly string[];
}) {
  const matchedUsers: Array<{ id: string; email: string }> = [];
  const perPage = 1_000;
  for (let page = 1; ; page += 1) {
    const users = await dependencies.listAuthUsersPage(page, perPage);
    for (const user of users) {
      const email = normalizeSyntheticEmail(user.email ?? "");
      if (isApprovedSyntheticEmail(email)) matchedUsers.push({ id: user.id, email });
    }
    if (users.length < perPage) break;
  }

  const protectedIds = new Set(dependencies.platformOwnerUserIds.map((id) => id.toLowerCase()));
  const excludedProtected = matchedUsers.filter((user) => protectedIds.has(user.id.toLowerCase()));
  const eligibleUsers = matchedUsers.filter((user) => !protectedIds.has(user.id.toLowerCase()));
  const memberships = eligibleUsers.length > 0
    ? await dependencies.listMemberships(eligibleUsers.map((user) => user.id))
    : [];
  const membershipsByUser = new Map<string, Membership[]>();
  for (const membership of memberships) {
    if (!membership.userId) continue;
    const list = membershipsByUser.get(membership.userId) ?? [];
    list.push(membership);
    membershipsByUser.set(membership.userId, list);
  }

  const accounts = eligibleUsers.map((user): SyntheticAccountInventoryItem => {
    const userMemberships = membershipsByUser.get(user.id) ?? [];
    return {
      userId: user.id,
      email: user.email,
      membershipCount: userMemberships.length,
      ownedWorkspaceIds: userMemberships
        .filter((membership) => membership.role === "OWNER")
        .map((membership) => membership.workspaceId)
        .sort(),
    };
  }).sort((a, b) => a.userId.localeCompare(b.userId));

  return {
    count: accounts.length,
    accounts,
    excludedProtectedCount: excludedProtected.length,
    membershipCount: accounts.reduce((total, account) => total + account.membershipCount, 0),
    ownedWorkspaceCount: accounts.reduce((total, account) => total + account.ownedWorkspaceIds.length, 0),
    digest: buildSyntheticInventoryDigest(accounts),
  };
}
