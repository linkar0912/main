import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { deliveryKeys } from "./outbound-delivery";
import { processBroadcastSend } from "./broadcast-runner";

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
