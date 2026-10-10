import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({}) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/src/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
const { createPrismaAdminAccountsRepository } = await import("./prisma-accounts-repository");

const SECRET = "prisma-accounts-cursor-secret-at-least-32-chars";
function authUser(index: number) {
  return { id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, email: `user${index}@acme.test`, created_at: new Date(Date.UTC(2026, 0, 1) - index * 1_000).toISOString(), last_sign_in_at: null };
}

const listUsers = vi.fn();
const getUserById = vi.fn();
const client = {
  platformUserControl: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
  workspaceMember: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
};
const repository = createPrismaAdminAccountsRepository(client as never, { auth: { admin: { listUsers, getUserById } } } as never, SECRET);

beforeEach(() => {
  listUsers.mockReset();
  getUserById.mockReset();
  client.workspaceMember.findMany.mockReset().mockResolvedValue([]);
});

describe("admin user listing", () => {
  it("reads one Auth page per view instead of every identity", async () => {
    listUsers.mockResolvedValue({ data: { users: Array.from({ length: 25 }, (_, index) => authUser(index)), nextPage: 2, lastPage: 40, total: 1000 }, error: null });
    const first = await repository.listAdminUsers({});
    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 25 });
    expect(first.items).toHaveLength(25);
    listUsers.mockResolvedValue({ data: { users: [authUser(25)], nextPage: null, lastPage: 2, total: 26 }, error: null });
    const second = await repository.listAdminUsers({ cursor: first.nextCursor });
    expect(listUsers).toHaveBeenLastCalledWith({ page: 2, perPage: 25 });
    expect(second.nextCursor).toBeNull();
  });

  it("caps the pages a search scans, falls back to workspace members, and says the search was limited", async () => {
    listUsers.mockImplementation(async ({ page }: { page: number }) => ({ data: { users: Array.from({ length: 1000 }, (_, index) => authUser(page * 1000 + index)), nextPage: page + 1, lastPage: 99, total: 99_000 }, error: null }));
    client.workspaceMember.findMany.mockResolvedValue([{ userId: authUser(90_000).id }]);
    getUserById.mockResolvedValue({ data: { user: { ...authUser(90_000), email: "needle@acme.test" } }, error: null });
    const result = await repository.listAdminUsers({ search: "needle" });
    expect(listUsers).toHaveBeenCalledTimes(5);
    expect(result.items.map((item) => item.email)).toEqual(["needle@acme.test"]);
    expect(result.searchLimited).toBe(true);
  });
});
