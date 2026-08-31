import { describe, expect, it } from "vitest";

import { createMemoryAdminAccountsRepository } from "./memory-accounts-repository";

const workspaces = Array.from({ length: 30 }, (_, index) => ({
  id: `w${String(index).padStart(2, "0")}`,
  name: `Workspace ${index}`,
  slug: `workspace-${index}`,
  status: index === 0 ? "SUSPENDED" as const : "ACTIVE" as const,
  createdAt: new Date(Date.UTC(2026, 7, 31, 10, 0, 0) - index * 1_000).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 7, 31, 10, 0, 0) - index * 1_000).toISOString(),
  version: 1,
  planKey: "free",
  planName: "Free",
  memberCount: 2,
  automationCount: index,
  instagramConnectionCount: 1,
  facebookConnectionCount: 0,
}));

describe("AdminAccountsRepository", () => {
  it("returns deterministic bounded workspace pages", async () => {
    const repository = createMemoryAdminAccountsRepository({ workspaces });

    const first = await repository.listAdminWorkspaces({ limit: 10 });
    const second = await repository.listAdminWorkspaces({ limit: 10, cursor: first.nextCursor });

    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(10);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(20);
  });

  it("never returns encrypted connection or secret fields in workspace DTOs", async () => {
    const repository = createMemoryAdminAccountsRepository({ workspaces });
    const page = await repository.listAdminWorkspaces({ limit: 25 });

    expect(JSON.stringify(page)).not.toMatch(/accessTokenEncrypted|secret|password/i);
    expect(await repository.getAdminWorkspace("w00")).toMatchObject({
      id: "w00",
      status: "SUSPENDED",
      memberCount: 2,
    });
  });

  it("bounds page size at 100 and filters users without exposing auth metadata", async () => {
    const repository = createMemoryAdminAccountsRepository({
      users: [{
        id: "u1",
        email: "owner@linkar.in",
        status: "ACTIVE",
        createdAt: "2026-08-31T10:00:00.000Z",
        lastSignInAt: null,
        workspaceCount: 1,
      }],
    });

    const page = await repository.listAdminUsers({ limit: 500, search: "OWNER" });
    expect(page.items).toHaveLength(1);
    expect(JSON.stringify(page)).not.toMatch(/app_metadata|user_metadata|token/i);
  });
});
