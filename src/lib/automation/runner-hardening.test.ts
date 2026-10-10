import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowDefinitionV1, NormalizedEvent } from "./types";
import { processNormalizedEvent, type AutomationRunnerClient } from "./runner";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { SendDeferredError } from "./send-deferral";

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
