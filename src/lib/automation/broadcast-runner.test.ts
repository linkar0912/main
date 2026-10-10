import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { deliveryKeys } from "./outbound-delivery";
import { processBroadcastSend } from "./broadcast-runner";
import { SendDeferredError } from "./send-deferral";

const TOKEN_KEY = "c".repeat(64);

describe("broadcast delivery ledger", () => {
  it("does not resend after provider success and counter reconciliation failure", async () => {
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
      status: "CONNECTED",
    });
    await repository.touchContact("workspace_a", "ig_1", "lead_1", new Date().toISOString());
    const broadcast = await repository.createBroadcast("workspace_a", {
      name: "News",
      text: "Big news!",
      segment: "all_contacts",
      total: 1,
    });
    const deliveryKey = deliveryKeys.broadcastRecipient(broadcast.id, "ig_1", "lead_1");
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: "workspace_a",
      broadcastId: broadcast.id,
      instagramAccountId: "ig_1",
      recipientId: "lead_1",
      kind: "BROADCAST_RECIPIENT",
      payload: { type: "text", text: "Big news!" },
    });
    const reconcile = repository.reconcileBroadcastCounters.bind(repository);
    repository.reconcileBroadcastCounters = vi.fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockImplementation(reconcile);
    const client = {
      sendDirectMessage: vi.fn().mockResolvedValue({ message_id: "message_1" }),
    };
    const job = {
      deliveryKey,
      broadcastId: broadcast.id,
      workspaceId: "workspace_a",
      igAccountId: "ig_1",
      igScopedUserId: "lead_1",
    };

    await expect(processBroadcastSend(job, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    })).rejects.toThrow("database unavailable");
    await processBroadcastSend(job, repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(await repository.getBroadcast("workspace_a", broadcast.id)).toMatchObject({
      status: "COMPLETED",
      sent: 1,
      failed: 0,
      skipped: 0,
    });
  });

  it("does not DM a recipient whose 24-hour messaging window has closed", async () => {
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
      status: "CONNECTED",
    });
    // Last inbound message was 8 days ago - exactly what the inactive_7d
    // segment selects for, and squarely outside Meta's 24-hour window.
    const staleIso = new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000).toISOString();
    await repository.touchContact("workspace_a", "ig_1", "lead_1", staleIso);
    const broadcast = await repository.createBroadcast("workspace_a", {
      name: "Win-back",
      text: "Come back!",
      segment: "inactive_7d",
      total: 1,
    });
    const deliveryKey = deliveryKeys.broadcastRecipient(broadcast.id, "ig_1", "lead_1");
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: "workspace_a",
      broadcastId: broadcast.id,
      instagramAccountId: "ig_1",
      recipientId: "lead_1",
      kind: "BROADCAST_RECIPIENT",
      payload: { type: "text", text: "Come back!" },
    });
    const client = { sendDirectMessage: vi.fn().mockResolvedValue({ message_id: "message_1" }) };

    await processBroadcastSend({
      deliveryKey,
      broadcastId: broadcast.id,
      workspaceId: "workspace_a",
      igAccountId: "ig_1",
      igScopedUserId: "lead_1",
    }, repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await repository.getOutboundDelivery(deliveryKey)).toMatchObject({
      state: "FAILED",
      resultCode: "WINDOW_CLOSED",
    });
  });

  it("DMs a recipient who messaged inside the 24-hour window", async () => {
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
      status: "CONNECTED",
    });
    await repository.touchContact(
      "workspace_a",
      "ig_1",
      "lead_1",
      new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString(),
    );
    const broadcast = await repository.createBroadcast("workspace_a", {
      name: "News",
      text: "Big news!",
      segment: "all_contacts",
      total: 1,
    });
    const deliveryKey = deliveryKeys.broadcastRecipient(broadcast.id, "ig_1", "lead_1");
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: "workspace_a",
      broadcastId: broadcast.id,
      instagramAccountId: "ig_1",
      recipientId: "lead_1",
      kind: "BROADCAST_RECIPIENT",
      payload: { type: "text", text: "Big news!" },
    });
    const client = { sendDirectMessage: vi.fn().mockResolvedValue({ message_id: "message_1" }) };

    await processBroadcastSend({
      deliveryKey,
      broadcastId: broadcast.id,
      workspaceId: "workspace_a",
      igAccountId: "ig_1",
      igScopedUserId: "lead_1",
    }, repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
  });
});

async function seedBroadcast(recipients: string[], lastSeenAt = new Date(Date.now() - 60_000).toISOString()) {
  const repository = createMemoryRepository();
  await repository.upsertConnection({
    workspaceId: "workspace_a",
    igUserId: "ig_1",
    username: "creator",
    accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
    status: "CONNECTED",
  });
  const broadcast = await repository.createBroadcast("workspace_a", {
    name: "News",
    text: "Big news!",
    segment: "all_contacts",
    total: recipients.length,
  });
  const jobs = [];
  for (const recipient of recipients) {
    await repository.touchContact("workspace_a", "ig_1", recipient, lastSeenAt);
    const deliveryKey = deliveryKeys.broadcastRecipient(broadcast.id, "ig_1", recipient);
    await repository.ensureOutboundDelivery({
      deliveryKey,
      workspaceId: "workspace_a",
      broadcastId: broadcast.id,
      instagramAccountId: "ig_1",
      recipientId: recipient,
      kind: "BROADCAST_RECIPIENT",
      payload: { type: "text", text: "Big news!" },
    });
    jobs.push({ deliveryKey, broadcastId: broadcast.id, workspaceId: "workspace_a", igAccountId: "ig_1", igScopedUserId: recipient });
  }
  return { repository, broadcast, jobs };
}

/** A quiet window that is active right now, in UTC, ending `hoursLeft` hours from now. */
function activeQuietWindow(hoursLeft: number) {
  const hour = new Date().getUTCHours();
  return { startHour: hour, endHour: (hour + hoursLeft) % 24, timezone: "UTC" };
}

describe("broadcast pacing and completion", () => {
  it("counts each outcome once and reconciles the ledger only when the blast finishes", async () => {
    const { repository, broadcast, jobs } = await seedBroadcast(["lead_1", "lead_2", "lead_3"]);
    const reconcile = vi.spyOn(repository, "reconcileBroadcastCounters");
    const client = { sendDirectMessage: vi.fn().mockResolvedValue({ message_id: "message_1" }) };

    for (const job of jobs.slice(0, 2)) {
      await processBroadcastSend(job, repository, { client, tokenEncryptionKey: TOKEN_KEY });
    }
    expect(reconcile).not.toHaveBeenCalled();
    expect(await repository.getBroadcast("workspace_a", broadcast.id)).toMatchObject({ status: "RUNNING", sent: 2 });

    await processBroadcastSend(jobs[2], repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(await repository.getBroadcast("workspace_a", broadcast.id)).toMatchObject({ status: "COMPLETED", sent: 3 });
  });

  it("defers during quiet hours instead of failing the job", async () => {
    const { repository, jobs } = await seedBroadcast(["lead_1"]);
    await repository.setMessagingWindow("workspace_a", activeQuietWindow(2));
    const client = { sendDirectMessage: vi.fn() };

    const error = await processBroadcastSend(jobs[0], repository, { client, tokenEncryptionKey: TOKEN_KEY, finalAttempt: true })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SendDeferredError);
    expect((error as SendDeferredError).delayMs).toBeGreaterThan(60 * 60_000);
    expect(client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await repository.getOutboundDelivery(jobs[0].deliveryKey)).toMatchObject({ state: "PENDING" });
  });

  it("settles a recipient as WINDOW_CLOSED when quiet hours outlast their 24-hour window", async () => {
    const { repository, broadcast, jobs } = await seedBroadcast(
      ["lead_1"],
      new Date(Date.now() - 23 * 60 * 60_000).toISOString(),
    );
    await repository.setMessagingWindow("workspace_a", activeQuietWindow(3));
    const client = { sendDirectMessage: vi.fn() };

    await processBroadcastSend(jobs[0], repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await repository.getOutboundDelivery(jobs[0].deliveryKey)).toMatchObject({ state: "FAILED", resultCode: "WINDOW_CLOSED" });
    expect(await repository.getBroadcast("workspace_a", broadcast.id)).toMatchObject({ status: "COMPLETED", skipped: 1 });
  });

  it("does not send to recipients of a cancelled broadcast", async () => {
    const { repository, jobs } = await seedBroadcast(["lead_1"]);
    const original = repository.getBroadcast.bind(repository);
    vi.spyOn(repository, "getBroadcast").mockImplementation(async (workspaceId, id) => {
      const record = await original(workspaceId, id);
      return record ? { ...record, status: "CANCELLED" } : record;
    });
    const client = { sendDirectMessage: vi.fn() };

    await processBroadcastSend(jobs[0], repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await repository.getOutboundDelivery(jobs[0].deliveryKey)).toMatchObject({ state: "FAILED", resultCode: "SUPPRESSED" });
  });

  it("settles the recipient when the last attempt fails so the blast can complete", async () => {
    const { repository, broadcast, jobs } = await seedBroadcast(["lead_1"]);
    vi.spyOn(repository, "findWorkspaceByInstagramAccount").mockRejectedValueOnce(new Error("database unavailable"));
    const client = { sendDirectMessage: vi.fn() };

    await expect(processBroadcastSend(jobs[0], repository, { client, tokenEncryptionKey: TOKEN_KEY, finalAttempt: true }))
      .rejects.toThrow("database unavailable");
    expect(await repository.getBroadcast("workspace_a", broadcast.id)).toMatchObject({ status: "COMPLETED", failed: 1 });
  });
});
