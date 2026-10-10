import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowDefinitionV1, NormalizedEvent } from "./types";
import { processNormalizedEvent, type AutomationRunnerClient } from "./runner";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { SendDeferredError } from "./send-deferral";
import { MetaApiError } from "../meta/client";

vi.mock("../mailer", () => ({ sendEmail: vi.fn().mockResolvedValue({ delivered: true, id: "email_1" }) }));
const rateLimit = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("./send-rate-limiter", () => ({ checkSendRateLimit: rateLimit.check }));

beforeEach(() => {
  rateLimit.check.mockReset().mockResolvedValue({ allowed: true });
});

const TOKEN_KEY = "a".repeat(64);

async function seed(definitions: FlowDefinitionV1[]) {
  const repository = createMemoryRepository(definitions.map((definition, index) => ({
    id: `automation_${index}`,
    workspaceId: "workspace_a",
    name: `Flow ${index}`,
    status: "ACTIVE" as const,
    version: 1,
    priority: definitions.length - index,
    definition,
    createdAt: new Date(1).toISOString(),
    updatedAt: new Date(1).toISOString(),
  })));
  await repository.upsertConnection({
    workspaceId: "workspace_a",
    igUserId: "ig_1",
    username: "creator",
    accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
    status: "CONNECTED",
  });
  return repository;
}

function messageEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    accountId: "ig_1",
    type: "message.received",
    text: "hello",
    recipientId: "person_1",
    timestamp: Date.now(),
    ...overrides,
  };
}

function runnerClient(): AutomationRunnerClient {
  return {
    sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "private_1" }),
    sendDirectMessage: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "direct_1" }),
    replyToComment: vi.fn().mockResolvedValue({ id: "public_1" }),
    sendQuickReply: vi.fn().mockResolvedValue({ message_id: "quick_1" }),
    getUserFollowStatus: vi.fn().mockResolvedValue({ isUserFollowingBusiness: true }),
    getMedia: vi.fn(),
  };
}

describe("runner PII handling", () => {
  it("never stores a captured email address in the execution reason", async () => {
    const repository = await seed([{
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["guide"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Here comes the guide!" }],
      emailCapture: { promptText: "What is your email?", confirmationText: "You are in!" },
    }]);
    const client = runnerClient();
    await processNormalizedEvent(messageEvent({ text: "guide" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    await processNormalizedEvent(messageEvent({ text: "it is jane@example.com" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    const executions = await repository.listAutomationExecutions("workspace_a", "automation_0", 20);
    expect(executions.some((execution) => execution.reason === "email_captured")).toBe(true);
    expect(JSON.stringify(executions)).not.toContain("jane@example.com");
  });
});

describe("runner send deferral", () => {
  it("defers the event when the account's send window is full, even on the last attempt", async () => {
    const repository = await seed([{
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["price"] },
      conditions: [],
      actions: [{ type: "send_text", text: "It is 10 dollars" }],
    }]);
    rateLimit.check.mockResolvedValue({ allowed: false, retryAfterMs: 20 * 60_000 });
    const client = runnerClient();
    const event = messageEvent({ text: "price" });

    const error = await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: TOKEN_KEY, finalAttempt: true })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SendDeferredError);
    expect(client.sendDirectMessage).not.toHaveBeenCalled();
    // The claim is released so the parked job can run the flow when it wakes.
    expect(await repository.getExecution("workspace_a", `automation_0:${event.id}`)).toBeNull();

    rateLimit.check.mockResolvedValue({ allowed: true });
    await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
  });
});

function commentEvent(id: string): NormalizedEvent {
  return {
    id,
    accountId: "ig_1",
    type: "comment.created",
    text: "guide please",
    commentId: id,
    mediaId: "media_1",
    recipientId: "person_1",
    timestamp: Date.now(),
  };
}

describe("runner claims and first contact", () => {
  it("still treats a retried first message as first contact", async () => {
    const repository = await seed([{
      version: 1,
      trigger: { type: "first_contact" },
      conditions: [],
      actions: [{ type: "send_text", text: "Welcome!" }],
    }]);
    const client = runnerClient();
    vi.mocked(client.sendDirectMessage).mockRejectedValueOnce(new MetaApiError("Service unavailable", 503, true));
    const event = messageEvent({ text: "hi" });

    await expect(processNormalizedEvent(event, repository, { client, tokenEncryptionKey: TOKEN_KEY }))
      .rejects.toThrow("Service unavailable");
    await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(client.sendDirectMessage).toHaveBeenCalledTimes(2);
    expect(await repository.getExecution("workspace_a", `automation_0:${event.id}`)).toMatchObject({ status: "SENT" });

    // A later message from the same person is not first contact.
    await processNormalizedEvent(messageEvent({ text: "again", timestamp: event.timestamp + 60_000 }), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(2);
  });

  it("applies replyOncePerUser to classic comment flows", async () => {
    const repository = await seed([{
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [], replyOncePerUser: true },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent you the guide" }],
    } as FlowDefinitionV1]);
    const client = runnerClient();

    await processNormalizedEvent(commentEvent("comment_1"), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    await processNormalizedEvent(commentEvent("comment_2"), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(client.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(await repository.getExecution("workspace_a", "automation_0:comment_2")).toMatchObject({ status: "SKIPPED" });
  });

  it("keeps the comment's winner when the higher-priority flow's claim is already taken", async () => {
    const repository = await seed([
      {
        version: 1,
        trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
        conditions: [],
        actions: [{ type: "private_reply", text: "From flow 0" }],
      } as FlowDefinitionV1,
      {
        version: 1,
        trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
        conditions: [],
        actions: [{ type: "private_reply", text: "From flow 1" }],
      } as FlowDefinitionV1,
    ]);
    // Another worker is mid-way through flow 0 for this comment (live lease).
    await repository.claimExecution({
      workspaceId: "workspace_a",
      automationId: "automation_0",
      externalEventId: "comment_1",
      dedupeKey: "automation_0:comment_1",
    });
    const client = runnerClient();

    await processNormalizedEvent(commentEvent("comment_1"), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(client.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("lets a later worker take over a claim whose holder died", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-10T10:00:00.000Z") });
    try {
      const repository = createMemoryRepository();
      const claim = {
        workspaceId: "workspace_a",
        automationId: "automation_0",
        externalEventId: "event_1",
        dedupeKey: "automation_0:event_1",
      };
      expect(await repository.claimExecution(claim)).toBe(true);
      expect(await repository.claimExecution(claim)).toBe(false);
      vi.setSystemTime(new Date("2026-10-10T10:06:00.000Z"));
      expect(await repository.claimExecution(claim)).toBe(true);
      expect(await repository.claimExecution(claim)).toBe(false);
      await repository.completeExecution("workspace_a", claim.dedupeKey, { status: "SENT" });
      vi.setSystemTime(new Date("2026-10-10T11:00:00.000Z"));
      expect(await repository.claimExecution(claim)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
