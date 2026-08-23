import { describe, expect, it, vi } from "vitest";
import { createPrismaRepository, prisma } from "./prisma";

// These tests exercise mapParticipantPatch's undefined-to-null translation for the four
// clearable participant diagnostic/error fields, without touching a real database. They
// inject a mock Prisma client into createPrismaRepository (the same injection seam the
// repository already exposes) and assert on the exact `data` payload the repository would
// send to Prisma's `automationParticipant.updateMany`.
//
// Why this matters: campaign-runner.ts clears a stale diagnostic field (e.g. after a retried
// action finally succeeds) by including the field in a transitionParticipant patch with value
// `undefined`. The memory repository clears it via a plain object spread, where `undefined`
// overwrites the old value. Prisma's `update`/`updateMany`, however, treats an `undefined`
// value in `data` as "don't touch this column" — so without translating it to `null`, a stale
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
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findUnique = vi.fn().mockResolvedValue(fakeParticipantRecord());
  const client = {
    automationParticipant: { updateMany, findUnique },
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
