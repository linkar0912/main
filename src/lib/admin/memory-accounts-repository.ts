import {
  boundedAdminLimit,
  type AdminAccountsRepository,
  type AdminUserDetail,
  type AdminWorkspaceDetail,
} from "./accounts-repository";
import { decodeAdminCursor, encodeAdminCursor } from "./cursor";

const DEFAULT_SECRET = "memory-admin-cursor-secret-at-least-32-characters";

type Seed = {
  workspaces?: AdminWorkspaceDetail[];
  users?: AdminUserDetail[];
};

function afterCursor<T extends { id: string; createdAt: string }>(items: T[], cursor: string | null | undefined, secret: string): T[] {
  if (!cursor) return items;
  const decoded = decodeAdminCursor(cursor, secret);
  return items.filter((item) => item.createdAt < decoded.createdAt || (item.createdAt === decoded.createdAt && item.id > decoded.id));
}

function page<T extends { id: string; createdAt: string }>(items: T[], limitInput: number | undefined, secret: string) {
  const limit = boundedAdminLimit(limitInput);
  const selected = items.slice(0, limit);
  const last = selected.at(-1);
  return {
    items: structuredClone(selected),
    nextCursor: items.length > limit && last ? encodeAdminCursor({ id: last.id, createdAt: last.createdAt }, secret) : null,
  };
}

export function createMemoryAdminAccountsRepository(seed: Seed = {}, secret = DEFAULT_SECRET): AdminAccountsRepository {
  const workspaces = structuredClone(seed.workspaces ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const users = structuredClone(seed.users ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));

  return {
    async listAdminWorkspaces(query) {
      const search = query.search?.trim().toLowerCase();
      const filtered = workspaces.filter((item) => !search || item.name.toLowerCase().includes(search) || item.slug.toLowerCase().includes(search));
      return page(afterCursor(filtered, query.cursor, secret), query.limit, secret);
    },
    async getAdminWorkspace(id) {
      const workspace = workspaces.find((item) => item.id === id);
      return workspace ? structuredClone(workspace) : null;
    },
    async listAdminUsers(query) {
      const search = query.search?.trim().toLowerCase();
      const filtered = users.filter((item) => !search || item.email.toLowerCase().includes(search));
      return page(afterCursor(filtered, query.cursor, secret), query.limit, secret);
    },
    async getAdminUser(id) {
      const user = users.find((item) => item.id === id);
      return user ? structuredClone(user) : null;
    },
  };
}
