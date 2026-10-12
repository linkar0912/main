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
    // No automation named (a manual edit): no analytics attribution.
    expect(update.mock.calls[0]?.[0]?.data).not.toHaveProperty("emailCapturedBy");
  });

  function captureClient(row: ReturnType<typeof contactRow>) {
    const update = vi.fn().mockImplementation(async ({ data }) => ({ ...row, ...data, tags: ["email_captured"] }));
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: row.id }]),
      automationContact: { findUniqueOrThrow: vi.fn().mockResolvedValue(row), update },
    };
    const client = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as typeof prisma;
    return { client, update };
  }

  it("attributes the capture to the automation, keeping the time it asked", async () => {
    const askedAt = new Date("2026-10-10T09:00:00.000Z");
    const { client, update } = captureClient(contactRow({ state: "AWAITING_EMAIL", emailRequestedBy: "automation_1", emailRequestedAt: askedAt }));

    const record = await createPrismaRepository(client).captureContactEmail("workspace_1", "ig_1", "person_1", "lead@example.com", "2026-10-10T10:01:00.000Z", "automation_1");

    const data = update.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({ emailCapturedBy: "automation_1", emailCapturedAt: new Date("2026-10-10T10:01:00.000Z") });
    expect(data).not.toHaveProperty("emailRequestedAt");
    expect(record.emailCapturedBy).toBe("automation_1");
    expect(record.emailRequestedAt).toBe(askedAt.toISOString());
  });

  it("counts an address sent before being asked as asked and answered at once", async () => {
    const { client, update } = captureClient(contactRow({ state: "NONE", emailRequestedBy: "automation_other", emailRequestedAt: new Date("2026-09-01T00:00:00.000Z") }));

    await createPrismaRepository(client).captureContactEmail("workspace_1", "ig_1", "person_1", "lead@example.com", "2026-10-10T10:01:00.000Z", "automation_1");

    expect(update.mock.calls[0]?.[0]?.data).toMatchObject({
      emailRequestedBy: "automation_1",
      emailRequestedAt: new Date("2026-10-10T10:01:00.000Z"),
      emailCapturedBy: "automation_1",
    });
  });
});

describe("setContactAwaitingEmail", () => {
  it("records which automation asked, kept after the wait ends", async () => {
    const update = vi.fn().mockImplementation(async ({ data }) => ({ ...contactRow(), ...data }));
    const client = { automationContact: { update } } as unknown as typeof prisma;

    await createPrismaRepository(client).setContactAwaitingEmail("workspace_1", "ig_1", "person_1", "automation_1", "2026-10-10T10:00:00.000Z");

    expect(update.mock.calls[0]?.[0]?.data).toMatchObject({
      awaitingAutomationId: "automation_1",
      emailRequestedBy: "automation_1",
      emailRequestedAt: new Date("2026-10-10T10:00:00.000Z"),
    });
  });
});

describe("countEmailCaptureFunnel", () => {
  it("counts distinct people messaged, then people asked and captured by this automation since the window start", async () => {
    const $queryRaw = vi.fn().mockResolvedValue([{ count: 9 }]);
    const count = vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(3);
    const client = { $queryRaw, automationContact: { count } } as unknown as typeof prisma;

    const result = await createPrismaRepository(client).countEmailCaptureFunnel("workspace_1", "automation_1", "2026-10-01T00:00:00.000Z");

    expect(result).toEqual({ messaged: 9, asked: 7, captured: 3 });
    const sql = sqlText($queryRaw.mock.calls[0]?.[0]);
    expect(sql).toContain('COUNT(DISTINCT "recipientId")');
    expect(sql).toContain(`"kind" = 'CLASSIC_ACTION'`);
    expect(sql).toContain(`"state" = 'SENT'`);
    expect(($queryRaw.mock.calls[0]?.[0] as Prisma.Sql).values).toEqual(["workspace_1", new Date("2026-10-01T00:00:00.000Z"), "automation_1"]);
    const since = new Date("2026-10-01T00:00:00.000Z");
    expect(count).toHaveBeenNthCalledWith(1, { where: { workspaceId: "workspace_1", emailRequestedBy: "automation_1", emailRequestedAt: { gte: since } } });
    expect(count).toHaveBeenNthCalledWith(2, { where: { workspaceId: "workspace_1", emailCapturedBy: "automation_1", emailCapturedAt: { gte: since } } });
  });
});

describe("listInboxContacts", () => {
  it("passes on who spoke last from the trigger-maintained column", async () => {
    const at = new Date("2026-10-10T10:00:00.000Z");
    const rows = [
      { ...contactRow({ id: "contact_in" }), latestInboundAt: at, preview: "Hi", unread: false, lastMessageDirection: "INBOUND" },
      { ...contactRow({ id: "contact_out" }), latestInboundAt: at, preview: "Hi", unread: false, lastMessageDirection: "OUTBOUND" },
      { ...contactRow({ id: "contact_unknown" }), latestInboundAt: at, preview: "Hi", unread: true, lastMessageDirection: null },
    ];
    const client = { $queryRaw: vi.fn().mockResolvedValue(rows) } as unknown as typeof prisma;

    const page = await createPrismaRepository(client).listInboxContacts("workspace_1", { limit: 10, sort: "newest", now: at.toISOString() });

    expect(page.rows.map((row) => [row.record.id, row.lastMessageDirection])).toEqual([
      ["contact_in", "INBOUND"],
      ["contact_out", "OUTBOUND"],
      ["contact_unknown", undefined],
    ]);
  });
});

describe("reconcileContactLastInbound", () => {
  it("re-derives who spoke last along with the latest inbound message", async () => {
    const $executeRaw = vi.fn().mockResolvedValue(2);
    const client = { $executeRaw } as unknown as typeof prisma;

    await createPrismaRepository(client).reconcileContactLastInbound("2026-10-10T00:00:00.000Z");

    const sql = sqlText($executeRaw.mock.calls[0]?.[0]);
    expect(sql).toContain('"lastMessageDirection" = CASE WHEN c."lastOutboundAt" IS NOT NULL AND c."lastOutboundAt" > e."receivedAt" THEN \'OUTBOUND\' ELSE \'INBOUND\' END');
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

describe("retention sweeps", () => {
  const ids = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}_${index}` }));

  it("deletes old webhook events and clears contacts in bounded id batches", async () => {
    const eventFindMany = vi.fn().mockResolvedValueOnce(ids(1_000, "event")).mockResolvedValueOnce(ids(3, "event_tail"));
    const eventDeleteMany = vi.fn().mockImplementation(async ({ where }) => ({ count: where.id.in.length }));
    const contactFindMany = vi.fn().mockResolvedValueOnce(ids(2, "contact"));
    const contactUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const client = {
      webhookEvent: { findMany: eventFindMany, deleteMany: eventDeleteMany },
      automationContact: { findMany: contactFindMany, updateMany: contactUpdateMany },
    } as unknown as typeof prisma;

    await expect(createPrismaRepository(client).deleteOldWebhookEvents("2026-07-12T00:00:00.000Z")).resolves.toBe(1_003);
    expect(eventDeleteMany).toHaveBeenCalledTimes(2);
    expect(eventFindMany.mock.calls[0]?.[0]).toMatchObject({ take: 1_000 });
    expect(contactUpdateMany).toHaveBeenCalledTimes(1);
    expect(contactUpdateMany.mock.calls[0]?.[0]?.where.id.in).toEqual(["contact_0", "contact_1"]);
  });

  it("expires stale participants in batches using the open states", async () => {
    const findMany = vi.fn().mockResolvedValueOnce(ids(1_000, "p")).mockResolvedValueOnce([]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1_000 });
    const client = { automationParticipant: { findMany, updateMany } } as unknown as typeof prisma;

    await expect(createPrismaRepository(client).expireStaleParticipants("2026-10-10T00:00:00.000Z", "expired")).resolves.toBe(1_000);
    expect(findMany.mock.calls[0]?.[0]?.where.state).toEqual({
      in: ["COMMENT_MATCHED", "OPENING_SENT", "OPTED_IN", "FOLLOW_REQUIRED", "FOLLOW_VERIFIED"],
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("advanceSequenceEnrollment", () => {
  it("only moves an ACTIVE enrollment that is still on the expected step", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const client = { sequenceEnrollment: { updateMany } } as unknown as typeof prisma;

    await expect(createPrismaRepository(client).advanceSequenceEnrollment("enrollment_1", 2, null, 1)).resolves.toBe(false);
    expect(updateMany.mock.calls[0]?.[0]?.where).toEqual({ id: "enrollment_1", state: "ACTIVE", currentStepIndex: 1 });
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
