import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "./memory-repository";
import { createPrismaRepository, prisma } from "./prisma";
import { containsPattern, contactMatchesSearch } from "./repository";

// Directory search (Contacts page and the ⌘K palette). Both repositories must
// find the same people: memory-repository filters in JS, prisma.ts sends one
// parameterised ILIKE query.

describe("contact search rule", () => {
  const contact = { instagramUsername: "Meera.Styles", email: "meera@example.com", tags: ["bridal", "50%_off"], assigneeUserId: "user_riya" };

  it("matches handle, email or any tag as a case-insensitive substring", () => {
    expect(contactMatchesSearch(contact, { text: "styles" })).toBe(true);
    expect(contactMatchesSearch(contact, { text: "EXAMPLE.COM" })).toBe(true);
    expect(contactMatchesSearch(contact, { text: "brid" })).toBe(true);
    expect(contactMatchesSearch(contact, { text: "nobody" })).toBe(false);
    expect(contactMatchesSearch(contact, { text: "nobody", assigneeUserIds: ["user_riya"] })).toBe(true);
  });

  it("escapes LIKE wildcards so they only match themselves", () => {
    expect(containsPattern("50%_off")).toBe("%50\\%\\_off%");
    expect(containsPattern(" a\\b ")).toBe("%a\\\\b%");
    expect(contactMatchesSearch(contact, { text: "%" })).toBe(true);
    expect(contactMatchesSearch({ ...contact, tags: [] }, { text: "%" })).toBe(false);
  });
});

describe("memory repository search", () => {
  it("filters the list and the stage counts, and never crosses workspaces", async () => {
    const repository = createMemoryRepository();
    await repository.touchContact("workspace_1", "ig_1", "meera", "2026-09-01T06:00:00.000Z");
    await repository.rememberContactUsernames("workspace_1", [{ instagramAccountId: "ig_1", igScopedUserId: "meera", username: "meera.styles" }]);
    await repository.touchContact("workspace_1", "ig_1", "other", "2026-09-01T07:00:00.000Z");
    await repository.touchContact("workspace_2", "ig_2", "meera_twin", "2026-09-01T08:00:00.000Z");
    await repository.rememberContactUsernames("workspace_2", [{ instagramAccountId: "ig_2", igScopedUserId: "meera_twin", username: "meera.styles" }]);

    const found = await repository.listContactsByLeadStatus("workspace_1", { limit: 10, search: { text: "MEERA" } });
    expect(found.map((row) => row.igScopedUserId)).toEqual(["meera"]);
    expect(await repository.countContactsByLeadStatus("workspace_1", { text: "meera" })).toEqual({ NEW: 1, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 });
    expect(await repository.countContactsByLeadStatus("workspace_1")).toEqual({ NEW: 2, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 });
  });
});

describe("prisma repository search", () => {
  function captureQueries(rows: unknown[] = []) {
    const queryRaw = vi.fn().mockResolvedValue(rows);
    const findMany = vi.fn().mockResolvedValue([]);
    const groupBy = vi.fn().mockResolvedValue([]);
    const client = { $queryRaw: queryRaw, automationContact: { findMany, groupBy } } as unknown as typeof prisma;
    return { repository: createPrismaRepository(client), queryRaw, findMany, groupBy };
  }
  const sqlOf = (call: unknown[]) => call[0] as Prisma.Sql;

  it("sends one workspace-scoped, parameterised ILIKE query with the wildcards escaped", async () => {
    const { repository, queryRaw, findMany } = captureQueries();
    await repository.listContactsByLeadStatus("workspace_1", {
      leadStatus: "CUSTOMER",
      limit: 6,
      search: { text: "50%_off", assigneeUserIds: ["user_riya"] },
      after: { lastSeenAt: "2026-09-01T06:00:00.000Z", id: "contact_9" },
    });
    expect(findMany).not.toHaveBeenCalled();
    const sql = sqlOf(queryRaw.mock.calls[0]);
    const text = sql.sql.replace(/\s+/g, " ");
    expect(text).toContain(`c."workspaceId" = ?`);
    expect(text).toContain(`COALESCE(c."instagramUsername", '') ILIKE ?`);
    expect(text).toContain(`COALESCE(c."email", '') ILIKE ?`);
    expect(text).toContain(`unnest(c."tags") AS tag WHERE tag ILIKE ?`);
    expect(text).toContain(`c."assigneeUserId" IN (?)`);
    expect(text).toContain(`c."leadStatus" = CAST(? AS "LeadStatus")`);
    expect(text).toContain(`ORDER BY c."lastSeenAt" DESC, c."id" ASC`);
    // Nothing from the person's text is spliced into the SQL itself.
    expect(text).not.toContain("50");
    expect(sql.values).toEqual(expect.arrayContaining(["workspace_1", "%50\\%\\_off%", "user_riya", "CUSTOMER", "contact_9", 6]));
  });

  it("keeps the plain Prisma query when there is no search", async () => {
    const { repository, queryRaw, findMany, groupBy } = captureQueries();
    await repository.listContactsByLeadStatus("workspace_1", { limit: 5, search: { text: "  " } });
    await repository.countContactsByLeadStatus("workspace_1");
    expect(queryRaw).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledTimes(1);
  });

  it("counts stages for the search only", async () => {
    const { repository, queryRaw } = captureQueries([{ leadStatus: "QUALIFIED", count: BigInt(3) }]);
    await expect(repository.countContactsByLeadStatus("workspace_1", { text: "meera" })).resolves.toEqual({ NEW: 0, ENGAGED: 0, QUALIFIED: 3, CUSTOMER: 0 });
    const sql = sqlOf(queryRaw.mock.calls[0]);
    expect(sql.sql).toMatch(/GROUP BY c\."leadStatus"/);
    expect(sql.values).toEqual(["workspace_1", "%meera%", "%meera%", "%meera%"]);
  });
});
