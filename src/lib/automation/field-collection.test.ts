import { describe, expect, it, vi } from "vitest";
import type { FlowDefinitionV1, NormalizedEvent } from "./types";
import { processNormalizedEvent, type AutomationRunnerClient } from "./runner";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { MetaApiError } from "../meta/client";

vi.mock("../mailer", () => ({ sendEmail: vi.fn().mockResolvedValue({ delivered: true }) }));

const TOKEN_KEY = "a".repeat(64);

function flowWithFields(fields: { id: string; question: string }[]): FlowDefinitionV1 {
  return {
    version: 1,
    trigger: { type: "message", match: "keyword", keywords: ["guide"] },
    conditions: [],
    actions: [{ type: "send_text", text: "Here comes the guide!" }],
    emailCapture: {
      promptText: "What is your email?",
      confirmationText: "You are in! ✅",
      fields,
    },
  };
}

async function seed(definition: FlowDefinitionV1) {
  const repository = createMemoryRepository([
    {
      id: "automation_0",
      workspaceId: "workspace_a",
      name: "Lead magnet",
      status: "ACTIVE" as const,
      version: 1,
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

/**
 * These cover the "email arrives in the very first message" path, which asks field 1
 * inline as its follow-up. That path used to store the queue minus the question it had
 * just asked, so the reply landed against the wrong field id.
 */
describe("conversational fields when the email arrives up front", () => {
  it("files the reply against the field that was actually asked", async () => {
    const repository = await seed(
      flowWithFields([
        { id: "name", question: "What's your name?" },
        { id: "company", question: "Where do you work?" },
      ]),
    );
    const client = runnerClient();

    await processNormalizedEvent(
      messageEvent({ text: "guide please - me@example.com" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    await processNormalizedEvent(messageEvent({ text: "Grace Hopper" }), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });

    const contact = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(contact?.fields).toEqual({ name: "Grace Hopper" });
    // The second question must still be outstanding, not skipped.
    expect(contact?.awaitingFields?.map((field) => field.id)).toEqual(["company"]);
  });

  it("completes a single-field form instead of abandoning the lead", async () => {
    const repository = await seed(flowWithFields([{ id: "name", question: "What's your name?" }]));
    const client = runnerClient();

    await processNormalizedEvent(
      messageEvent({ text: "guide please - solo@example.com" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    await processNormalizedEvent(messageEvent({ text: "Ada Lovelace" }), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });

    const contact = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(contact?.fields).toEqual({ name: "Ada Lovelace" });
    expect(contact?.state).toBe("CAPTURED");
    expect(contact?.email).toBe("solo@example.com");
  });

  it("stores a blank reply as empty rather than echoing the question back", async () => {
    const repository = await seed(flowWithFields([{ id: "name", question: "What's your name?" }]));
    const client = runnerClient();

    await processNormalizedEvent(
      messageEvent({ text: "guide please - blank@example.com" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    await processNormalizedEvent(messageEvent({ text: "   " }), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });

    const contact = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(contact?.fields?.name).toBe("");
    expect(contact?.fields?.name).not.toBe("What's your name?");
  });

  it("does not advance a field answer until the next question is durably sent", async () => {
    const repository = await seed(flowWithFields([
      { id: "name", question: "What's your name?" },
      { id: "company", question: "Where do you work?" },
    ]));
    const client = runnerClient();
    await processNormalizedEvent(
      messageEvent({ id: "field_resume_0", text: "guide - lead@example.com" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    vi.mocked(client.sendDirectMessage).mockClear();
    vi.mocked(client.sendDirectMessage)
      .mockRejectedValueOnce(new MetaApiError("temporarily unavailable", 503))
      .mockResolvedValueOnce({ recipient_id: "person_1", message_id: "next_question" });
    const answer = messageEvent({ id: "field_resume_1", text: "Grace Hopper" });

    await expect(processNormalizedEvent(answer, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    })).rejects.toThrow("temporarily unavailable");
    const pendingContact = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(pendingContact).toMatchObject({
        state: "AWAITING_FIELD",
        awaitingFields: [
          { id: "name", question: "What's your name?" },
          { id: "company", question: "Where do you work?" },
        ],
      });
    expect(pendingContact?.fields).toBeUndefined();

    await processNormalizedEvent(answer, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });
    expect(vi.mocked(client.sendDirectMessage).mock.calls.map(
      (call) => (call[2] as { text: string }).text,
    )).toEqual(["Where do you work?", "Where do you work?"]);
    expect(await repository.getContact("workspace_a", "ig_1", "person_1"))
      .toMatchObject({
        state: "AWAITING_FIELD",
        fields: { name: "Grace Hopper" },
        awaitingFields: [{ id: "company", question: "Where do you work?" }],
      });
  });

  it("retries field-queue persistence without resending the first question", async () => {
    const repository = await seed(flowWithFields([
      { id: "name", question: "What's your name?" },
    ]));
    const client = runnerClient();
    await processNormalizedEvent(
      messageEvent({ id: "queue_resume_0", text: "guide" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    vi.mocked(client.sendDirectMessage).mockClear();
    const beginContactFieldCollection = repository.beginContactFieldCollection.bind(repository);
    repository.beginContactFieldCollection = vi.fn()
      .mockRejectedValueOnce(new Error("field queue write unavailable"))
      .mockImplementation(beginContactFieldCollection);
    const emailReply = messageEvent({ id: "queue_resume_1", text: "lead@example.com" });

    await expect(processNormalizedEvent(emailReply, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    })).rejects.toThrow("field queue write unavailable");
    await processNormalizedEvent(emailReply, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });

    expect(vi.mocked(client.sendDirectMessage).mock.calls.map(
      (call) => (call[2] as { text: string }).text,
    )).toEqual(["What's your name?"]);
    expect(await repository.getContact("workspace_a", "ig_1", "person_1"))
      .toMatchObject({
        state: "AWAITING_FIELD",
        email: "lead@example.com",
        awaitingFields: [{ id: "name", question: "What's your name?" }],
      });
  });

  it("retries answer persistence without resending the next question", async () => {
    const repository = await seed(flowWithFields([
      { id: "name", question: "What's your name?" },
      { id: "company", question: "Where do you work?" },
    ]));
    const client = runnerClient();
    await processNormalizedEvent(
      messageEvent({ id: "answer_resume_0", text: "guide - lead@example.com" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );
    vi.mocked(client.sendDirectMessage).mockClear();
    const recordContactFieldAnswer = repository.recordContactFieldAnswer.bind(repository);
    repository.recordContactFieldAnswer = vi.fn()
      .mockRejectedValueOnce(new Error("answer write unavailable"))
      .mockImplementation(recordContactFieldAnswer);
    const answer = messageEvent({ id: "answer_resume_1", text: "Grace Hopper" });

    await expect(processNormalizedEvent(answer, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    })).rejects.toThrow("answer write unavailable");
    await processNormalizedEvent(answer, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });

    expect(vi.mocked(client.sendDirectMessage).mock.calls.map(
      (call) => (call[2] as { text: string }).text,
    )).toEqual(["Where do you work?"]);
    expect(await repository.getContact("workspace_a", "ig_1", "person_1"))
      .toMatchObject({
        fields: { name: "Grace Hopper" },
        awaitingFields: [{ id: "company", question: "Where do you work?" }],
      });
  });
});
