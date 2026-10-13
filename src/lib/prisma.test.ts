import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { createPrismaRepository, prisma } from "./prisma";
import type { FlowDefinition } from "./automation/types";

// These tests exercise mapParticipantPatch's undefined-to-null translation for the four
// clearable participant diagnostic/error fields, without touching a real database. They
// inject a mock Prisma client into createPrismaRepository (the same injection seam the
// repository already exposes) and assert on the exact `data` payload the repository would
// send to Prisma's `automationParticipant.updateManyAndReturn`.
//
// Why this matters: campaign-runner.ts clears a stale diagnostic field (e.g. after a retried
// action finally succeeds) by including the field in a transitionParticipant patch with value
// `undefined`. The memory repository clears it via a plain object spread, where `undefined`
// overwrites the old value. Prisma's `update`/`updateMany`, however, treats an `undefined`
// value in `data` as "don't touch this column" - so without translating it to `null`, a stale
// error message would survive forever in Postgres even after the underlying action succeeds.

function fakeParticipantRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "participant_1",
    workspaceId: "workspace_1",
    automationId: "automation_1",
    instagramAccountId: "ig_business_1",
    igScopedUserId: null,
    sourceCommentId: "comment_1",
    sourceMediaId: "media_1",
    sourceMediaSnapshot: {},
    matchedKeyword: null,
    state: "LINK_SENT",
    publicReplyStatus: "SENT",
    publicReplyProviderId: null,
    publicReplySentAt: null,
    publicReplyError: null,
    openingStatus: "SENT",
    openingProviderId: null,
    openingSentAt: null,
    openingError: null,
    followStatus: true,
    followCheckedAt: null,
    followCheckError: null,
    finalDeliveryStatus: "SENT",
    finalProviderId: null,
    finalDeliveredAt: null,
    finalDeliveryError: null,
    messagingWindowExpiresAt: null,
    recheckCount: 0,
    createdAt: new Date("2026-08-21T00:00:00.000Z"),
    updatedAt: new Date("2026-08-21T00:00:00.000Z"),
    ...overrides,
  };
}

function createMockPrismaClient() {
  // transitionParticipant writes and reads back in one UPDATE ... RETURNING.
  const updateMany = vi.fn().mockResolvedValue([fakeParticipantRecord()]);
  const findUnique = vi.fn().mockResolvedValue(fakeParticipantRecord());
  const client = {
    automationParticipant: { updateManyAndReturn: updateMany, findUnique },
  } as unknown as typeof prisma;
  return { client, updateMany, findUnique };
}

describe("mapParticipantPatch (via transitionParticipant)", () => {
  it.each([
    "publicReplyError",
    "openingError",
    "followCheckError",
    "finalDeliveryError",
  ] as const)("translates an explicit undefined %s into a Prisma null so the column is actually cleared", async (field) => {
    const { client, updateMany } = createMockPrismaClient();
    const repository = createPrismaRepository(client);

    await repository.transitionParticipant("participant_1", ["LINK_SENT"], {
      [field]: undefined,
    });

    expect(updateMany).toHaveBeenCalledTimes(1);
    const data = updateMany.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data[field]).toBeNull();
  });

  it("does not touch a clearable error field that was never mentioned in the patch", async () => {
    const { client, updateMany } = createMockPrismaClient();
    const repository = createPrismaRepository(client);

    await repository.transitionParticipant("participant_1", ["OPENING_SENT"], {
      state: "OPTED_IN",
    });

    const data = updateMany.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(data, "publicReplyError")).toBe(false);
    expect(data.state).toBe("OPTED_IN");
  });

  it("transitions in one statement, without a second round trip to re-read the row", async () => {
    const { client, updateMany, findUnique } = createMockPrismaClient();
    const repository = createPrismaRepository(client);

    await expect(repository.transitionParticipant("participant_1", ["OPENING_SENT"], { state: "OPTED_IN" }))
      .resolves.toMatchObject({ id: "participant_1" });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "participant_1", state: { in: ["OPENING_SENT"] } },
    }));
    expect(findUnique).not.toHaveBeenCalled();

    updateMany.mockResolvedValueOnce([]);
    await expect(repository.transitionParticipant("participant_1", ["OPENING_SENT"], { state: "OPTED_IN" }))
      .resolves.toBeNull();
  });

  it("passes through a real error message unchanged (does not null out a live diagnostic)", async () => {
    const { client, updateMany } = createMockPrismaClient();
    const repository = createPrismaRepository(client);

    await repository.transitionParticipant("participant_1", ["COMMENT_MATCHED"], {
      publicReplyError: "Meta public reply temporarily failed",
    });

    const data = updateMany.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.publicReplyError).toBe("Meta public reply temporarily failed");
  });
});

describe("Prisma automation edits", () => {
  it("writes the edited definition and snapshots the previous definition in the same transaction", async () => {
    const previousDefinition: FlowDefinition = {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["old"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Old reply" }],
    };
    const editedDefinition: FlowDefinition = {
      ...previousDefinition,
      actions: [{ type: "send_text", text: "Edited reply" }],
    };
    const previous = {
      id: "automation_1",
      workspaceId: "workspace_1",
      provider: "INSTAGRAM",
      instagramAccountId: "ig_1",
      facebookPageId: null,
      name: "Welcome",
      status: "ACTIVE",
      version: 1,
      definition: previousDefinition,
      activatedAt: new Date("2026-09-01T10:00:00.000Z"),
      boundMediaId: null,
      priority: 4,
      createdAt: new Date("2026-09-01T09:00:00.000Z"),
      updatedAt: new Date("2026-09-01T10:00:00.000Z"),
      archivedAt: null,
    };
    const createVersion = vi.fn().mockResolvedValue({
      id: "autover_1",
      automationId: previous.id,
      workspaceId: previous.workspaceId,
      version: 1,
      name: previous.name,
      definition: previousDefinition,
      status: previous.status,
      priority: previous.priority,
      activatedAt: previous.activatedAt,
      boundMediaId: null,
      instagramAccountId: previous.instagramAccountId,
      facebookPageId: null,
      snapshotBy: "user_editor",
      snapshotAt: new Date("2026-09-05T08:00:00.000Z"),
    });
    const update = vi.fn().mockResolvedValue({ ...previous, definition: editedDefinition });
    const transaction = {
      automation: { findFirst: vi.fn().mockResolvedValue(previous), update },
      automationVersion: {
        aggregate: vi.fn().mockResolvedValue({ _max: { version: null } }),
        create: createVersion,
      },
    };
    const client = {
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => unknown) => operation(transaction)),
    } as unknown as typeof prisma;
    const repository = createPrismaRepository(client);

    await (repository.updateAutomation as unknown as (
      workspaceId: string,
      id: string,
      patch: { definition: FlowDefinition },
      options: { snapshotBy: string },
    ) => Promise<unknown>)(
      "workspace_1",
      "automation_1",
      { definition: editedDefinition },
      { snapshotBy: "user_editor" },
    );

    expect(createVersion).toHaveBeenCalledWith({
      data: expect.objectContaining({
        automationId: "automation_1",
        definition: previousDefinition,
        provider: "INSTAGRAM",
        snapshotBy: "user_editor",
      }),
    });
    // Automation.version is a write counter: every edit increments it and it
    // never takes the definition schema version.
    expect(update).toHaveBeenCalledWith({
      where: { id: "automation_1" },
      data: expect.objectContaining({ definition: editedDefinition, version: { increment: 1 } }),
    });
  });

  it("increments the counter on a status-only change too", async () => {
    const previous = { id: "automation_1", workspaceId: "workspace_1", provider: "INSTAGRAM", version: 4 };
    const update = vi.fn().mockResolvedValue({ ...previous });
    const transaction = { automation: { findFirst: vi.fn().mockResolvedValue(previous), update } };
    const client = {
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => unknown) => operation(transaction)),
    } as unknown as typeof prisma;

    await createPrismaRepository(client).updateAutomation("workspace_1", "automation_1", { status: "PAUSED" }).catch(() => undefined);

    expect(update).toHaveBeenCalledWith({
      where: { id: "automation_1" },
      data: expect.objectContaining({ status: "PAUSED", version: { increment: 1 } }),
    });
  });

  it("retries a serialization failure (P2034) up to three times before giving up", async () => {
    const conflict = Object.assign(new Error("write conflict"), { code: "P2034" });
    const transactionCall = vi.fn()
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(null);
    const client = { $transaction: transactionCall } as unknown as typeof prisma;

    await expect(createPrismaRepository(client).updateAutomation("workspace_1", "automation_1", { name: "x" })).resolves.toBeNull();
    expect(transactionCall).toHaveBeenCalledTimes(3);

    const alwaysConflicting = vi.fn().mockRejectedValue(conflict);
    await expect(createPrismaRepository({ $transaction: alwaysConflicting } as unknown as typeof prisma)
      .updateAutomation("workspace_1", "automation_1", { name: "x" })).rejects.toBe(conflict);
    expect(alwaysConflicting).toHaveBeenCalledTimes(4);
  });

  it("restores a version's provider inside one transaction and bumps the counter", async () => {
    const current = {
      id: "automation_1", workspaceId: "workspace_1", provider: "INSTAGRAM", instagramAccountId: "ig_1", facebookPageId: null,
      name: "Now", status: "ACTIVE", version: 6, definition: { version: 1 }, activatedAt: null, boundMediaId: null, priority: 0,
    };
    const target = {
      id: "autover_1", automationId: "automation_1", workspaceId: "workspace_1", version: 1, name: "Then",
      definition: { version: 1 }, status: "DRAFT", priority: 0, activatedAt: null, boundMediaId: null,
      instagramAccountId: null, facebookPageId: "page_1", provider: "FACEBOOK", snapshotBy: null, snapshotAt: new Date(),
    };
    const update = vi.fn().mockResolvedValue({ ...current, createdAt: new Date(), updatedAt: new Date() });
    const createVersion = vi.fn().mockResolvedValue(target);
    const transaction = {
      automation: { findFirst: vi.fn().mockResolvedValue(current), update },
      automationVersion: {
        findFirst: vi.fn().mockResolvedValue(target),
        aggregate: vi.fn().mockResolvedValue({ _max: { version: 3 } }),
        create: createVersion,
      },
    };
    const transactionCall = vi.fn(async (operation: (tx: typeof transaction) => unknown) => operation(transaction));
    const repository = createPrismaRepository({ $transaction: transactionCall } as unknown as typeof prisma);

    await repository.restoreAutomationVersion("workspace_1", "automation_1", "autover_1", "user_1");

    expect(transactionCall).toHaveBeenCalledTimes(1);
    expect(createVersion).toHaveBeenCalledWith({ data: expect.objectContaining({ version: 4, provider: "INSTAGRAM", instagramAccountId: "ig_1" }) });
    expect(update).toHaveBeenCalledWith({
      where: { id: "automation_1" },
      data: expect.objectContaining({
        provider: "FACEBOOK",
        facebookPageId: "page_1",
        instagramAccountId: null,
        version: { increment: 1 },
      }),
    });
  });
});

describe("sequence enrollment tenancy", () => {
  it("does not create an enrollment unless sequence and contact match the requested workspace", async () => {
    const sequenceFindFirst = vi.fn().mockResolvedValue(null);
    const contactFindFirst = vi.fn().mockResolvedValue({ id: "contact_1", workspaceId: "workspace_a" });
    const enrollmentCreate = vi.fn().mockResolvedValue({ id: "enrollment_1" });
    const client = {
      automationSequence: { findFirst: sequenceFindFirst },
      automationContact: { findFirst: contactFindFirst },
      sequenceEnrollment: { findUnique: vi.fn().mockResolvedValue(null), create: enrollmentCreate },
    } as unknown as typeof prisma;
    const repository = createPrismaRepository(client);

    await expect(repository.enrollContactInSequence(
      "workspace_a", "sequence_from_b", "contact_1", 0, "2026-08-23T00:00:00.000Z",
    )).resolves.toEqual({ created: false });

    expect(sequenceFindFirst).toHaveBeenCalledWith({ where: { id: "sequence_from_b", workspaceId: "workspace_a" } });
    expect(contactFindFirst).toHaveBeenCalledWith({ where: { id: "contact_1", workspaceId: "workspace_a" } });
    expect(enrollmentCreate).not.toHaveBeenCalled();
  });
});

function fakeOutboundDeliveryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "delivery_1",
    deliveryKey: "automation:automation_1:event:comment_1:action:0",
    workspaceId: "workspace_a",
    kind: "CLASSIC_ACTION",
    recipientId: "scoped_user_1",
    instagramAccountId: "ig_123",
    automationId: "automation_1",
    participantId: null,
    sequenceEnrollmentId: null,
    broadcastId: null,
    payload: { text: "Original message" },
    state: "PENDING",
    retryable: false,
    resultCode: null,
    claimOwner: null,
    claimExpiresAt: null,
    attemptCount: 0,
    providerMessageId: null,
    lastError: null,
    createdAt: new Date("2026-08-23T10:00:00.000Z"),
    updatedAt: new Date("2026-08-23T10:00:00.000Z"),
    sentAt: null,
    ...overrides,
  };
}

describe("Prisma outbound delivery ledger", () => {
  it("claims only pending or retryable failed records", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = vi.fn().mockResolvedValue(fakeOutboundDeliveryRecord({
      state: "CLAIMED",
      claimOwner: "worker_a",
      claimExpiresAt: new Date("2026-08-23T10:05:00.000Z"),
      attemptCount: 1,
    }));
    const client = {
      outboundDelivery: { updateMany, findUniqueOrThrow },
    } as unknown as typeof prisma;
    const repository = createPrismaRepository(client);

    await expect(repository.claimOutboundDelivery(
      "automation:automation_1:event:comment_1:action:0",
      "worker_a",
      "2026-08-23T10:05:00.000Z",
    )).resolves.toMatchObject({ claimed: true, record: { state: "CLAIMED", attemptCount: 1 } });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        deliveryKey: "automation:automation_1:event:comment_1:action:0",
        OR: [{ state: "PENDING" }, { state: "FAILED", retryable: true }],
      },
      data: {
        state: "CLAIMED",
        version: { increment: 1 },
        retryable: false,
        claimOwner: "worker_a",
        claimExpiresAt: new Date("2026-08-23T10:05:00.000Z"),
        attemptCount: { increment: 1 },
      },
    });
  });

  it("uses an atomic SQL reservation and returns whether a slot was claimed", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ reserved: 2 }]);
    const client = { $queryRaw: queryRaw } as unknown as typeof prisma;
    const repository = createPrismaRepository(client);

    await expect(repository.claimAutomationSendSlots(
      "automation_1",
      "2026-08-23",
      2,
      3,
    )).resolves.toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid quota requests before touching PostgreSQL", async () => {
    const queryRaw = vi.fn();
    const client = { $queryRaw: queryRaw } as unknown as typeof prisma;
    const repository = createPrismaRepository(client);

    await expect(repository.claimAutomationSendSlots(
      "automation_1",
      "2026-08-23",
      0,
      3,
    )).rejects.toThrow("amount must be a positive integer");
    await expect(repository.claimAutomationSendSlots(
      "automation_1",
      "not-a-date",
      1,
      3,
    )).rejects.toThrow("utcDate must use YYYY-MM-DD");
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

// Every statement is a network round trip to a database on another continent,
// and these sit between Meta's webhook and the reply - so the number of
// statements each one sends is part of its contract.
describe("realtime send path statement counts", () => {
  const prepareInput = {
    deliveryKey: "automation:automation_1:event:comment_1:action:0",
    workspaceId: "workspace_1",
    kind: "CLASSIC_ACTION" as const,
    recipientId: "person_1",
    instagramAccountId: "ig_1",
    automationId: "automation_1",
    payload: { type: "private_reply", text: "Hi" },
    owner: "worker_a",
    leaseUntil: "2026-08-23T10:05:00.000Z",
    periodStart: "2026-08-01",
    monthlyLimit: 100,
  };

  function uniqueViolation(target: string[]) {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.19.3",
      meta: { target },
    });
  }

  it("claims a fresh delivery and reserves its usage slot in one statement", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{
      source: "claimed",
      ...fakeOutboundDeliveryRecord({ state: "CLAIMED", claimOwner: "worker_a", attemptCount: 1 }),
      alreadyReserved: false,
      counted: true,
    }]);
    const repository = createPrismaRepository({ $queryRaw: queryRaw } as unknown as typeof prisma);

    await expect(repository.prepareOutboundDelivery(prepareInput)).resolves.toMatchObject({
      status: "CLAIMED",
      record: { state: "CLAIMED", claimOwner: "worker_a", attemptCount: 1 },
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = (queryRaw.mock.calls[0]?.[0] as Prisma.Sql).sql;
    // The claim only takes PENDING or retryable FAILED rows, and usage is
    // counted only for the row this statement claimed.
    expect(sql).toContain(`WHERE "OutboundDelivery"."state" = 'PENDING'`);
    expect(sql).toContain(`OR ("OutboundDelivery"."state" = 'FAILED' AND "OutboundDelivery"."retryable")`);
    expect(sql).toMatch(/counted AS \(\s+INSERT INTO "WorkspaceUsagePeriod"[\s\S]+FROM claimed/);
  });

  it("reports a terminal delivery from the same statement, without a second read", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{
      source: "current",
      ...fakeOutboundDeliveryRecord({ state: "SENT", providerMessageId: "mid_1" }),
      alreadyReserved: false,
      counted: false,
    }]);
    const findUniqueOrThrow = vi.fn();
    const repository = createPrismaRepository({
      $queryRaw: queryRaw,
      outboundDelivery: { findUniqueOrThrow },
    } as unknown as typeof prisma);

    await expect(repository.prepareOutboundDelivery(prepareInput))
      .resolves.toMatchObject({ status: "TERMINAL", record: { state: "SENT" } });
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("re-reads the row when another caller claimed it during the statement", async () => {
    // The snapshot still shows PENDING, but the claim lost: someone else holds it now.
    const queryRaw = vi.fn().mockResolvedValue([{
      source: "current",
      ...fakeOutboundDeliveryRecord({ state: "PENDING" }),
      alreadyReserved: false,
      counted: false,
    }]);
    const findUniqueOrThrow = vi.fn().mockResolvedValue(fakeOutboundDeliveryRecord({ state: "CLAIMED", claimOwner: "worker_b" }));
    const repository = createPrismaRepository({
      $queryRaw: queryRaw,
      outboundDelivery: { findUniqueOrThrow },
    } as unknown as typeof prisma);

    await expect(repository.prepareOutboundDelivery(prepareInput))
      .resolves.toMatchObject({ status: "BUSY", record: { claimOwner: "worker_b" } });
  });

  it("marks the claimed delivery suppressed when the monthly limit is reached", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{
      source: "claimed",
      ...fakeOutboundDeliveryRecord({ state: "CLAIMED", claimOwner: "worker_a" }),
      alreadyReserved: false,
      counted: false,
    }]);
    const update = vi.fn().mockResolvedValue(fakeOutboundDeliveryRecord({ state: "FAILED", resultCode: "SUPPRESSED" }));
    const repository = createPrismaRepository({
      $queryRaw: queryRaw,
      outboundDelivery: { update },
    } as unknown as typeof prisma);

    await expect(repository.prepareOutboundDelivery(prepareInput)).resolves.toMatchObject({ status: "QUOTA_REJECTED" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ state: "FAILED", resultCode: "SUPPRESSED", lastError: "Monthly delivery limit reached" }),
    }));
  });

  it("completes a sent delivery with one UPDATE that only its claim owner can apply", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const repository = createPrismaRepository({ $executeRaw: executeRaw } as unknown as typeof prisma);

    await expect(repository.completeOutboundDelivery("key_1", "worker_a", "mid_1", "2026-08-23T10:01:00.000Z")).resolves.toBe(true);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const statement = executeRaw.mock.calls[0]?.[0] as Prisma.Sql;
    expect(statement.sql).toContain(`AND "state" = 'CLAIMED'`);
    expect(statement.text).toContain(`AND "claimOwner" = $`);
    expect(statement.values).toEqual(expect.arrayContaining(["key_1", "worker_a", "mid_1", "2026-08-23T10:01:00.000Z"]));

    executeRaw.mockResolvedValueOnce(0);
    await expect(repository.completeOutboundDelivery("key_1", "worker_b", "mid_1", "2026-08-23T10:01:00.000Z")).resolves.toBe(false);
  });

  describe("claimExecutionDispatch", () => {
    const claim = {
      workspaceId: "workspace_1",
      automationId: "automation_1",
      externalEventId: "comment_1",
      dedupeKey: "campaign:participant_1:opening_reply",
      dispatchOwner: "owner_1",
      dispatchStartedAt: "2026-08-21T10:00:00.000Z",
      dispatchLeaseExpiresAt: "2026-08-21T10:00:30.000Z",
    };

    function executionClient() {
      const create = vi.fn().mockResolvedValue({});
      const findFirst = vi.fn().mockResolvedValue(null);
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const client = { automationExecution: { create, findFirst, updateMany } } as unknown as typeof prisma;
      return { client, create, findFirst, updateMany };
    }

    it("claims a new action with a single insert", async () => {
      const { client, create, findFirst, updateMany } = executionClient();
      await expect(createPrismaRepository(client).claimExecutionDispatch(claim)).resolves.toBe(true);
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: "PROCESSING", dispatchStatus: "DISPATCHING", dispatchOwner: "owner_1", dedupeKey: claim.dedupeKey }),
      });
      expect(findFirst).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it("refuses an owner token the unique index says is already used", async () => {
      const { client, create, updateMany } = executionClient();
      create.mockRejectedValue(uniqueViolation(["dispatchOwner"]));
      await expect(createPrismaRepository(client).claimExecutionDispatch(claim)).resolves.toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it("with onlyIfNew, leaves an existing row for the caller to inspect", async () => {
      const { client, create, findFirst, updateMany } = executionClient();
      create.mockRejectedValue(uniqueViolation(["workspaceId", "dedupeKey"]));
      await expect(createPrismaRepository(client).claimExecutionDispatch(claim, { onlyIfNew: true })).resolves.toBe(false);
      expect(findFirst).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it("takes over an existing claimable row with the compare-and-set update", async () => {
      const { client, create, findFirst, updateMany } = executionClient();
      create.mockRejectedValue(uniqueViolation(["workspaceId", "dedupeKey"]));
      await expect(createPrismaRepository(client).claimExecutionDispatch(claim)).resolves.toBe(true);
      expect(findFirst).toHaveBeenCalledWith({ where: { dispatchOwner: "owner_1" }, select: { id: true } });
      expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ dedupeKey: claim.dedupeKey, status: "PROCESSING" }),
      }));

      findFirst.mockResolvedValueOnce({ id: "execution_other" });
      await expect(createPrismaRepository(client).claimExecutionDispatch(claim)).resolves.toBe(false);
    });
  });
});

describe("broadcast reconciliation after admin cancellation", () => {
  it("counts cancelled recipients as skipped and preserves terminal broadcast cancellation", async () => {
    let broadcast = { status: "CANCELLED", completedAt: new Date(0), sent: 0, skipped: 0 };
    const updateMany = vi.fn(async ({ where, data }) => {
      const matches = typeof where.status === "string" ? broadcast.status === where.status : broadcast.status !== where.status.not;
      if (matches) broadcast = { ...broadcast, ...data };
      return { count: matches ? 1 : 0 };
    });
    const transaction = {
      outboundDelivery: { groupBy: vi.fn().mockResolvedValue([
        { state: "CANCELLED", resultCode: null, _count: { _all: 2 } },
        { state: "SENT", resultCode: "DELIVERED", _count: { _all: 1 } },
      ]) },
      broadcast: { updateMany },
    };
    const client = { $transaction: async (work: (tx: unknown) => unknown) => work(transaction) } as unknown as typeof prisma;
    const counters = await createPrismaRepository(client).reconcileBroadcastCounters("workspace_1", "broadcast_1");
    expect(counters).toEqual({ total: 3, sent: 1, skipped: 2, failed: 0, pending: 0 });
    expect(broadcast).toMatchObject({ status: "CANCELLED", completedAt: new Date(0), sent: 1, skipped: 2 });
  });
});

describe("prisma repository onboarding", () => {
  const row = {
    workspaceId: "workspace_1",
    answers: { goals: ["sell"] },
    step: 4,
    completedAt: null,
    skippedAt: new Date("2026-10-12T00:00:00.000Z"),
    existingWorkspace: false,
    inviteDismissedAt: null,
    planDismissedAt: null,
    createdAt: new Date("2026-10-11T00:00:00.000Z"),
    updatedAt: new Date("2026-10-12T00:00:00.000Z"),
  };

  it("upserts only the fields in the patch, mapping null to a cleared column", async () => {
    const upsert = vi.fn().mockResolvedValue({ ...row, skippedAt: null, completedAt: new Date("2026-10-12T02:00:00.000Z") });
    const client = { workspaceOnboarding: { upsert } } as unknown as typeof prisma;
    const saved = await createPrismaRepository(client).saveWorkspaceOnboarding("workspace_1", {
      completedAt: "2026-10-12T02:00:00.000Z",
      skippedAt: null,
    });
    const data = { completedAt: new Date("2026-10-12T02:00:00.000Z"), skippedAt: null };
    expect(upsert).toHaveBeenCalledWith({ where: { workspaceId: "workspace_1" }, create: { workspaceId: "workspace_1", ...data }, update: data });
    expect(saved).toMatchObject({ workspaceId: "workspace_1", completedAt: "2026-10-12T02:00:00.000Z", answers: { goals: ["sell"] } });
    expect(saved).not.toHaveProperty("skippedAt");
  });

  it("reads a row back with ISO dates and never trusts a non-object answers column", async () => {
    const findUnique = vi.fn().mockResolvedValue({ ...row, answers: ["not", "an", "object"] });
    const client = { workspaceOnboarding: { findUnique } } as unknown as typeof prisma;
    const record = await createPrismaRepository(client).getWorkspaceOnboarding("workspace_1");
    expect(record).toMatchObject({ answers: {}, skippedAt: "2026-10-12T00:00:00.000Z", step: 4 });
  });

  it("keys member onboarding by workspace and lowercased email", async () => {
    const upsert = vi.fn().mockResolvedValue({
      workspaceId: "workspace_1", email: "arjun@team.test", displayName: "Arjun", focus: null, step: 1,
      completedAt: null, skippedAt: null, existingMember: false, createdAt: new Date(0), updatedAt: new Date(0),
    });
    const client = { memberOnboarding: { upsert } } as unknown as typeof prisma;
    const saved = await createPrismaRepository(client).saveMemberOnboarding("workspace_1", "Arjun@Team.test", { displayName: "Arjun" });
    expect(upsert).toHaveBeenCalledWith({
      where: { workspaceId_email: { workspaceId: "workspace_1", email: "arjun@team.test" } },
      create: { workspaceId: "workspace_1", email: "arjun@team.test", displayName: "Arjun" },
      update: { displayName: "Arjun" },
    });
    expect(saved).toMatchObject({ displayName: "Arjun", email: "arjun@team.test" });
    expect(saved).not.toHaveProperty("focus");
  });
});
