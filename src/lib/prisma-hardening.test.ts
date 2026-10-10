import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createPrismaRepository, prisma } from "./prisma";

// Mock-client tests for the Prisma repository functions hardened against
// concurrency: they assert on the statements the repository sends, since the
// race itself can only be reproduced against a real database.

function sqlText(query: unknown): string {
  return (query as Prisma.Sql).strings.join("?").replace(/\s+/g, " ");
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact_1",
    workspaceId: "workspace_1",
    instagramAccountId: "ig_1",
    igScopedUserId: "person_1",
    instagramUsername: null,
    email: null,
    state: "AWAITING_FIELD",
    awaitingAutomationId: "automation_1",
    awaitingSince: new Date("2026-10-10T00:00:00.000Z"),
    attempts: 0,
    tags: [],
    score: 0,
    leadStatus: "NEW",
    assigneeUserId: null,
    notes: null,
    sourceAutomationId: null,
    fields: null,
    awaitingFields: [{ id: "name", question: "Name?" }, { id: "company", question: "Company?" }],
    suppressedAt: null,
    automationsPausedUntil: null,
    automationsPausedReason: null,
    inboxStatus: "OPEN",
    inboxFavorite: false,
    inboxReminderAt: null,
    inboxLastReadAt: null,
    lastSeenAt: new Date("2026-10-10T10:00:00.000Z"),
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-10T10:00:00.000Z"),
    ...overrides,
  };
}

describe("touchContact", () => {
  it("advances lastSeenAt with GREATEST against the stored row, not the caller's snapshot", async () => {
    const queryRaw = vi.fn().mockResolvedValue([contactRow()]);
    const update = vi.fn();
    const client = { $queryRaw: queryRaw, automationContact: { update } } as unknown as typeof prisma;
    const repository = createPrismaRepository(client);

    await repository.touchContact("workspace_1", "ig_1", "person_1", "2026-10-10T09:00:00.000Z", {
      id: "contact_1",
      createdAt: "2026-10-01T00:00:00.000Z",
      lastSeenAt: "2026-10-10T08:00:00.000Z",
    } as never);

    expect(update).not.toHaveBeenCalled();
    const text = sqlText(queryRaw.mock.calls[0]?.[0]);
    expect(text).toContain(`"lastSeenAt" = GREATEST("lastSeenAt", ?)`);
    expect(text).toContain(`"createdAt" = LEAST("createdAt", ?)`);
  });
});

describe("recordContactFieldAnswer", () => {
  function transactionalClient(row: ReturnType<typeof contactRow>) {
    const update = vi.fn().mockImplementation(async ({ data }) => ({ ...row, ...data }));
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: row.id }]),
      automationContact: { findUniqueOrThrow: vi.fn().mockResolvedValue(row), update },
    };
    const client = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as typeof prisma;
    return { client, transaction, update };
  }

  it("locks the contact row and answers the outstanding question", async () => {
    const { client, transaction, update } = transactionalClient(contactRow());
    const repository = createPrismaRepository(client);

    const updated = await repository.recordContactFieldAnswer(
      "workspace_1", "ig_1", "person_1", "name", "Grace", [{ id: "company", question: "Company?" }], "2026-10-10T10:01:00.000Z",
    );

    expect(sqlText(transaction.$queryRaw.mock.calls[0]?.[0])).toContain("FOR UPDATE");
    expect(update).toHaveBeenCalledTimes(1);
    expect(updated?.fields).toEqual({ name: "Grace" });
  });

  it("refuses an answer for a question that was already answered", async () => {
    const { client, update } = transactionalClient(contactRow({
      fields: { name: "Grace" },
      awaitingFields: [{ id: "company", question: "Company?" }],
    }));
    const repository = createPrismaRepository(client);

    await expect(repository.recordContactFieldAnswer(
      "workspace_1", "ig_1", "person_1", "name", "Hopper", [{ id: "company", question: "Company?" }], "2026-10-10T10:01:00.000Z",
    )).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("captureContactEmail", () => {
  it("derives score and tags from the row-locked contact", async () => {
    const row = contactRow({ state: "NONE", tags: ["vip"], score: 20 });
    const update = vi.fn().mockImplementation(async ({ data }) => ({ ...row, ...data, tags: ["vip", "email_captured"] }));
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: row.id }]),
      automationContact: { findUniqueOrThrow: vi.fn().mockResolvedValue(row), update },
    };
    const client = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as typeof prisma;

    await createPrismaRepository(client).captureContactEmail("workspace_1", "ig_1", "person_1", "Lead@Example.com", "2026-10-10T10:01:00.000Z");

    expect(sqlText(transaction.$queryRaw.mock.calls[0]?.[0])).toContain("FOR UPDATE");
    expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ email: "lead@example.com", score: 30, tags: { push: "email_captured" } });
  });
});

describe("claimExecution", () => {
  it("writes a lease and takes over only an abandoned PROCESSING claim", async () => {
    const create = vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }));
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = { automationExecution: { create, updateMany } } as unknown as typeof prisma;
    const repository = createPrismaRepository(client);

    await expect(repository.claimExecution({
      workspaceId: "workspace_1", automationId: "automation_1", externalEventId: "event_1", dedupeKey: "automation_1:event_1",
    })).resolves.toBe(true);

    expect(create.mock.calls[0]?.[0]?.data.dispatchLeaseExpiresAt).toBeInstanceOf(Date);
    const where = updateMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ status: "PROCESSING", dispatchStatus: "CLAIMED", dedupeKey: "automation_1:event_1" });
    expect(where.OR).toHaveLength(2);
  });
});

describe("listConnectionsExpiringBefore", () => {
  it("includes connections whose expiry was never recorded", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = { instagramConnection: { findMany } } as unknown as typeof prisma;
    await createPrismaRepository(client).listConnectionsExpiringBefore("2026-11-10T00:00:00.000Z");
    expect(findMany.mock.calls[0]?.[0]?.where.OR).toEqual([
      { tokenExpiresAt: null },
      { tokenExpiresAt: { lte: new Date("2026-11-10T00:00:00.000Z") } },
    ]);
  });
});
