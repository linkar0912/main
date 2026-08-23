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
});
