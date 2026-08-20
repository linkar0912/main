import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { FlowDefinition, NormalizedEvent } from "./types";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { processNormalizedEvent } from "./runner";
import { MetaApiError } from "../meta/client";

const flow: FlowDefinition = {
  version: 1,
  trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply", text: "Here is the guide" }],
};

const event: NormalizedEvent = {
  id: "comment_1",
  accountId: "ig_1",
  type: "comment.created",
  text: "guide",
  commentId: "comment_1",
  recipientId: "person_1",
  timestamp: 1,
};

describe("automation runner", () => {
  it("delivers a matching action and deduplicates the webhook event", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([
      {
        id: "automation_1",
        workspaceId: "workspace_a",
        name: "Guide delivery",
        status: "ACTIVE",
        version: 1,
        definition: flow,
        createdAt: new Date(1).toISOString(),
        updatedAt: new Date(1).toISOString(),
      },
    ]);
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", key),
      status: "CONNECTED",
    });
    const client = {
      sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "message_1" }),
      sendDirectMessage: vi.fn(),
    };

    const first = await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key });
    const second = await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key });

    expect(first).toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(second).toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      "Here is the guide",
    );
  });

  it("leaves retryable Meta failures unrecorded so the queue can retry", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([{ id: "automation_retry", workspaceId: "workspace_a", name: "Retry delivery", status: "ACTIVE", version: 1, definition: flow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() }]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = {
      sendPrivateReply: vi.fn()
        .mockRejectedValueOnce(new MetaApiError("rate limited", 429))
        .mockResolvedValueOnce({ message_id: "message_retry" }),
      sendDirectMessage: vi.fn(),
    };

    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key })).rejects.toThrow("rate limited");
    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key })).resolves.toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(client.sendPrivateReply).toHaveBeenCalledTimes(2);
  });

  it("records a retryable delivery failure only on the final queue attempt", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository([{ id: "automation_final", workspaceId: "workspace_a", name: "Final attempt", status: "ACTIVE", version: 1, definition: flow, createdAt: new Date(1).toISOString(), updatedAt: new Date(1).toISOString() }]);
    await repository.upsertConnection({ workspaceId: "workspace_a", igUserId: "ig_1", username: "creator", accessTokenEncrypted: sealSecret("access-token", key), status: "CONNECTED" });
    const client = { sendPrivateReply: vi.fn().mockRejectedValue(new MetaApiError("temporarily unavailable", 503)), sendDirectMessage: vi.fn() };

    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key, finalAttempt: true })).resolves.toEqual({ matched: 1, sent: 0, skipped: 0, failed: 1 });
    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: key, finalAttempt: true })).resolves.toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
  });
});
