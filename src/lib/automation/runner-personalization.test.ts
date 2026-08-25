import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowDefinition } from "./types";
import type { NormalizedEvent } from "./types";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { processNormalizedEvent, type AutomationRunnerClient } from "./runner";

const TOKEN_KEY = "a".repeat(64);

vi.mock("../queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../queue")>()),
  enqueueFlowFollowUps: vi.fn().mockResolvedValue(1),
}));

const { enqueueFlowFollowUps } = await import("../queue");

function runnerClient(): AutomationRunnerClient {
  return {
    sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "pr_1" }),
    sendDirectMessage: vi.fn().mockResolvedValue({ message_id: "dm_1" }),
    replyToComment: vi.fn(),
    sendQuickReply: vi.fn(),
    getUserFollowStatus: vi.fn(),
    getMedia: vi.fn(),
  };
}

async function seed(definition: FlowDefinition) {
  const repository = createMemoryRepository([
    {
      id: "automation_1",
      workspaceId: "workspace_a",
      name: "Personalized",
      status: "ACTIVE",
      version: definition.version,
      priority: 0,
      definition,
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

describe("personalization tokens and follow-up scheduling", () => {
  beforeEach(() => {
    vi.mocked(enqueueFlowFollowUps).mockClear();
  });

  it("fills {username}, {keyword}, and {media} on a comment private reply", async () => {
    const repository = await seed({
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Thanks {username}! The {keyword} for {media} is on its way." }],
    });
    const client = runnerClient();
    const event: NormalizedEvent = {
      id: "comment_1",
      accountId: "ig_1",
      type: "comment.created",
      text: "guide please",
      commentId: "comment_1",
      mediaId: "media_9",
      recipientId: "person_1",
      senderUsername: "ravi",
      timestamp: 1,
    };

    const result = await processNormalizedEvent(event, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });

    expect(result).toMatchObject({ sent: 1 });
    expect(client.sendPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      "comment_1",
      "Thanks ravi! The guide for your post is on its way.",
    );
  });

  it("degrades {username} to 'there' when the webhook has no handle", async () => {
    const repository = await seed({
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Hi {username}! Welcome." }],
    });
    const client = runnerClient();
    const event: NormalizedEvent = {
      id: "message_1",
      accountId: "ig_1",
      type: "message.received",
      text: "hello",
      recipientId: "person_2",
      timestamp: 1,
    };

    await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(client.sendDirectMessage).toHaveBeenCalledWith(
      expect.anything(),
      "person_2",
      expect.objectContaining({ type: "text", text: "Hi there! Welcome." }),
    );
  });

  it("schedules rendered follow-up jobs after a successful DM flow", async () => {
    const repository = await seed({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["offer"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Offer for {username}" }],
      followUps: [{ delayMinutes: 1440, text: "Still interested, {username}?", buttonLabel: "Claim", url: "https://example.com/o" }],
    });
    const client = runnerClient();
    const event: NormalizedEvent = {
      id: "message_2",
      accountId: "ig_1",
      type: "message.received",
      text: "offer",
      recipientId: "person_3",
      timestamp: 1,
    };

    const result = await processNormalizedEvent(event, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });

    expect(result).toMatchObject({ sent: 1 });
    expect(vi.mocked(enqueueFlowFollowUps)).toHaveBeenCalledTimes(1);
    const jobs = vi.mocked(enqueueFlowFollowUps).mock.calls[0][0];
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      automationId: "automation_1",
      recipientId: "person_3",
      delayMinutes: 1440,
      message: { type: "button", text: "Still interested, there?", buttonLabel: "Claim", url: "https://example.com/o" },
    });
  });

  it("does not schedule follow-ups when the flow defines none", async () => {
    const repository = await seed({
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Hello" }],
    });
    const client = runnerClient();

    await processNormalizedEvent({
      id: "message_3",
      accountId: "ig_1",
      type: "message.received",
      text: "hi",
      recipientId: "person_4",
      timestamp: 1,
    }, repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(vi.mocked(enqueueFlowFollowUps)).not.toHaveBeenCalled();
  });
});
