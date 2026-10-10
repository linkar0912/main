import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";
import { broadcastSegmentCutoff } from "./repository";

async function seedContact(
  repository: ReturnType<typeof createMemoryRepository>,
  igScopedUserId: string,
  lastSeenAt: string,
) {
  await repository.ensureWorkspace("workspace_a", "owner@example.com");
  await repository.upsertConnection({
    workspaceId: "workspace_a",
    igUserId: "ig_1",
    username: "creator",
    accessTokenEncrypted: "sealed",
    status: "CONNECTED",
  });
  await repository.touchContact("workspace_a", "ig_1", igScopedUserId, lastSeenAt);
}

describe("win-back broadcast segments", () => {
  it("computes cutoffs only for inactive segments", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    expect(broadcastSegmentCutoff("all_contacts", now)).toBeNull();
    expect(broadcastSegmentCutoff("captured_email", now)).toBeNull();
    expect(broadcastSegmentCutoff("inactive_7d", now)?.toISOString()).toBe("2026-08-17T12:00:00.000Z");
    expect(broadcastSegmentCutoff("inactive_30d", now)?.toISOString()).toBe("2026-07-25T12:00:00.000Z");
  });

  async function messaged(repository: ReturnType<typeof createMemoryRepository>, workspaceId: string, accountId: string, person: string, at: string) {
    await repository.recordWebhookEvent(workspaceId, {
      providerEventId: `dm_${person}_${at}`,
      eventType: "message.received",
      receivedAt: at,
      payload: { accountId, recipientId: person, text: "hi" },
    });
  }

  it("lists only people inside the 24-hour window, most recently active first, with the uncapped count", async () => {
    const repository = createMemoryRepository();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1_000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1_000).toISOString();

    await seedContact(repository, "quiet_1", tenDaysAgo);
    await messaged(repository, "workspace_a", "ig_1", "quiet_1", tenDaysAgo);
    await seedContact(repository, "fresh_1", oneHourAgo);
    await messaged(repository, "workspace_a", "ig_1", "fresh_1", oneHourAgo);
    await seedContact(repository, "fresher_1", tenMinutesAgo);
    await messaged(repository, "workspace_a", "ig_1", "fresher_1", tenMinutesAgo);
    await seedContact(repository, "silent_1", tenMinutesAgo);
    await seedContact(repository, "opted_out", tenMinutesAgo);
    await messaged(repository, "workspace_a", "ig_1", "opted_out", tenMinutesAgo);
    await repository.suppressContact("workspace_a", "ig_1", "opted_out", tenMinutesAgo);

    await repository.ensureWorkspace("workspace_b", "other@example.com");
    await repository.upsertConnection({
      workspaceId: "workspace_b",
      igUserId: "ig_2",
      username: "other",
      accessTokenEncrypted: "sealed",
      status: "CONNECTED",
    });
    await repository.touchContact("workspace_b", "ig_2", "foreign_fresh", oneHourAgo);
    await messaged(repository, "workspace_b", "ig_2", "foreign_fresh", oneHourAgo);

    const all = await repository.listBroadcastRecipients("workspace_a", "all_contacts", 100);
    expect(all.recipients.map((recipient) => recipient.igScopedUserId)).toEqual(["fresher_1", "fresh_1"]);
    expect(all.totalEligible).toBe(2);

    const capped = await repository.listBroadcastRecipients("workspace_a", "all_contacts", 1);
    expect(capped.recipients.map((recipient) => recipient.igScopedUserId)).toEqual(["fresher_1"]);
    expect(capped.totalEligible).toBe(2);

    // Legacy win-back segments select people outside the window by
    // construction, so they can never produce a sendable recipient.
    const winback = await repository.listBroadcastRecipients("workspace_a", "inactive_7d", 100);
    expect(winback).toEqual({ recipients: [], totalEligible: 0 });
  });

  it("reserves the monthly broadcast allowance atomically and per period", async () => {
    const repository = createMemoryRepository();

    expect(await repository.reserveMonthlyBroadcast("workspace_a", "2026-10-01", 2)).toEqual({ reserved: true, used: 1 });
    expect(await repository.reserveMonthlyBroadcast("workspace_a", "2026-10-01", 2)).toEqual({ reserved: true, used: 2 });
    expect(await repository.reserveMonthlyBroadcast("workspace_a", "2026-10-01", 2)).toEqual({ reserved: false, used: 2 });
    expect(await repository.reserveMonthlyBroadcast("workspace_a", "2026-11-01", 2)).toEqual({ reserved: true, used: 1 });
    expect(await repository.reserveMonthlyBroadcast("workspace_a", "2026-10-01", 0)).toMatchObject({ reserved: false });

    await repository.releaseMonthlyBroadcast("workspace_a", "2026-10-01");
    expect((await repository.getWorkspaceUsage("workspace_a", "2026-10-01")).broadcastsCreated).toBe(1);
  });
});
