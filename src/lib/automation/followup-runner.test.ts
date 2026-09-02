import { describe, expect, it, vi } from "vitest";
import { processFlowFollowUp } from "./followup-runner";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import type { FlowFollowUpJob } from "../queue";

const TOKEN_KEY = "a".repeat(64);

const followUpFlow = {
  version: 1,
  trigger: { type: "message", match: "keyword", keywords: ["offer"] },
  conditions: [],
  actions: [{ type: "send_text", text: "Offer inside" }],
  followUps: [{ delayMinutes: 1440, text: "Still interested?" }],
} as const;

function job(overrides: Partial<FlowFollowUpJob> = {}): FlowFollowUpJob {
  return {
    deliveryKey: "automation:automation_1:event:event_1:followup:0",
    workspaceId: "workspace_a",
    automationId: "automation_1",
    instagramAccountId: "ig_1",
    recipientId: "lead_1",
    delayMinutes: 1440,
    message: { type: "text", text: "Still interested?" },
    ...overrides,
  };
}

async function seed(automationStatus: "ACTIVE" | "PAUSED" = "ACTIVE") {
  const repository = createMemoryRepository([
    {
      id: "automation_1",
      workspaceId: "workspace_a",
      name: "Offer",
      status: automationStatus,
      version: 1, priority: 0,
      definition: followUpFlow as unknown as Parameters<never>[0],
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    },
  ]);
  await repository.upsertConnection({
    workspaceId: "workspace_a",
    igUserId: "ig_1",
    username: "creator",
    accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
    status: "CONNECTED",
  });
  return repository;
}

function client() {
  return {
    sendDirectMessage: vi.fn().mockResolvedValue({ message_id: "nudge_1" }),
  };
}

const options = (clientInstance: ReturnType<typeof client>) => ({
  client: clientInstance,
  tokenEncryptionKey: TOKEN_KEY,
});

describe("flow follow-up runner", () => {
  it("delivers a due nudge through the delivery ledger", async () => {
    const repository = await seed();
    await repository.touchContact("workspace_a", "ig_1", "lead_1", new Date().toISOString());
    const dmClient = client();

    await processFlowFollowUp(job(), repository, options(dmClient));

    expect(dmClient.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(dmClient.sendDirectMessage.mock.calls[0][1]).toBe("lead_1");
    const ledger = await repository.getOutboundDelivery(job().deliveryKey);
    expect(ledger?.state).toBe("SENT");
  });

  it("skips with WINDOW_CLOSED when the person has not messaged in 24 hours", async () => {
    const repository = await seed();
    await repository.touchContact(
      "workspace_a",
      "ig_1",
      "lead_1",
      new Date(Date.now() - 25 * 60 * 60 * 1_000).toISOString(),
    );
    const dmClient = client();

    await processFlowFollowUp(job(), repository, options(dmClient));

    expect(dmClient.sendDirectMessage).not.toHaveBeenCalled();
    const ledger = await repository.getOutboundDelivery(job().deliveryKey);
    expect(ledger?.state).toBe("FAILED");
    expect(ledger?.resultCode).toBe("WINDOW_CLOSED");
  });

  it("skips suppressed recipients and paused automations without sending", async () => {
    const repository = await seed();
    await repository.touchContact("workspace_a", "ig_1", "lead_1", new Date().toISOString());
    await repository.suppressContact("workspace_a", "ig_1", "lead_1", new Date().toISOString());
    const dmClient = client();

    await processFlowFollowUp(job(), repository, options(dmClient));
    expect(dmClient.sendDirectMessage).not.toHaveBeenCalled();
    expect((await repository.getOutboundDelivery(job().deliveryKey))?.resultCode).toBe("SUPPRESSED");

    const paused = await seed("PAUSED");
    const pausedClient = client();
    await processFlowFollowUp(job(), paused, options(pausedClient));
    expect(pausedClient.sendDirectMessage).not.toHaveBeenCalled();
    expect((await paused.getOutboundDelivery(job().deliveryKey))?.resultCode).toBe("SUPPRESSED");
  });
});
