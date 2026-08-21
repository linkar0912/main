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
