import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { lastInboundDmAt } from "./last-inbound-dm";

async function record(
  repository: ReturnType<typeof createMemoryRepository>,
  id: string,
  eventType: string,
  receivedAt: string,
  recipientId = "lead_1",
) {
  await repository.recordWebhookEvent("workspace_a", {
    providerEventId: id,
    eventType,
    receivedAt,
    payload: { accountId: "ig_1", recipientId, text: "hi" },
  });
}

describe("lastInboundDmAt", () => {
  it("returns the newest inbound DM time for the person", async () => {
    const repository = createMemoryRepository();
    await record(repository, "e1", "message.received", "2026-10-15T08:00:00.000Z");
    await record(repository, "e2", "quick_reply.received", "2026-10-16T09:00:00.000Z");
    await record(repository, "e3", "message.received", "2026-10-14T07:00:00.000Z");

    expect(await lastInboundDmAt(repository, "workspace_a", "ig_1", "lead_1")).toBe("2026-10-16T09:00:00.000Z");
  });

  it("ignores comments and other people's messages", async () => {
    const repository = createMemoryRepository();
    await record(repository, "e1", "message.received", "2026-10-15T08:00:00.000Z");
    await record(repository, "e2", "comment.created", "2026-10-16T09:00:00.000Z");
    await record(repository, "e3", "message.received", "2026-10-16T10:00:00.000Z", "lead_2");

    expect(await lastInboundDmAt(repository, "workspace_a", "ig_1", "lead_1")).toBe("2026-10-15T08:00:00.000Z");
  });

  it("returns undefined when the person never sent a DM", async () => {
    const repository = createMemoryRepository();
    await repository.touchContact("workspace_a", "ig_1", "lead_1", new Date().toISOString());

    expect(await lastInboundDmAt(repository, "workspace_a", "ig_1", "lead_1")).toBeUndefined();
  });
});
