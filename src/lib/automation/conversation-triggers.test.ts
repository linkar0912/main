import { describe, expect, it, vi } from "vitest";
import type { FlowDefinitionV1, NormalizedEvent } from "./types";
import { evaluateFlow } from "./engine";
import { extractEmailAddress, processNormalizedEvent, type AutomationRunnerClient } from "./runner";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { normalizeWebhook } from "../meta/webhooks";
import { validateFlowDefinition } from "./definition";

const TOKEN_KEY = "a".repeat(64);

const welcomeFlow: FlowDefinitionV1 = {
  version: 1,
  trigger: { type: "first_contact" },
  conditions: [],
  actions: [{ type: "send_text", text: "Welcome aboard! 👋" }],
};

const storyFlow: FlowDefinitionV1 = {
  version: 1,
  trigger: { type: "story_mention" },
  conditions: [],
  actions: [
    { type: "send_text", text: "Thanks for the mention! 🧡" },
    { type: "send_button", text: "Here is your gift.", buttonLabel: "Claim gift", url: "https://example.com/gift" },
  ],
};

function captureFlow(): FlowDefinitionV1 {
  return {
    version: 1,
    trigger: { type: "message", match: "keyword", keywords: ["guide"] },
    conditions: [],
    actions: [{ type: "send_text", text: "Here comes the guide!" }],
    emailCapture: {
      promptText: "What is your email?",
      retryText: "That is not an email — try again.",
      confirmationText: "You are in! ✅",
    },
  };
}

async function seed(definitions: FlowDefinitionV1[]) {
  const repository = createMemoryRepository(
    definitions.map((definition, index) => ({
      id: `automation_${index}`,
      workspaceId: "workspace_a",
      name: `Automation ${index}`,
      status: "ACTIVE" as const,
      version: 1,
      definition,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    })),
  );
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

function createRunnerClient(): AutomationRunnerClient {
  return {
    sendPrivateReply: vi.fn().mockResolvedValue({ message_id: "private_1" }),
    sendDirectMessage: vi.fn().mockResolvedValue({ recipient_id: "person_1", message_id: "direct_1" }),
    replyToComment: vi.fn().mockResolvedValue({ id: "public_1" }),
    sendQuickReply: vi.fn().mockResolvedValue({ message_id: "quick_1" }),
    getUserFollowStatus: vi.fn().mockResolvedValue({ isUserFollowingBusiness: true }),
    getMedia: vi.fn(),
  };
}

describe("story mention webhooks", () => {
  it("normalizes story_mention attachments into story_mention.received events", () => {
    const events = normalizeWebhook({
      object: "instagram",
      entry: [{
        id: "ig_1",
        time: 1_720_000_000_000,
        messaging: [{
          sender: { id: "person_1" },
          recipient: { id: "ig_1" },
          timestamp: 1_720_000_000_000,
          message: {
            mid: "mid_story_1",
            attachments: [{
              type: "story_mention",
              payload: { url: "https://example.com/story", story: { id: "story_media_9", url: "https://example.com/story" } },
            }],
          },
        }],
      }],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "mid_story_1",
      accountId: "ig_1",
      type: "story_mention.received",
      recipientId: "person_1",
      mediaId: "story_media_9",
    });
  });

  it("does not emit a duplicate plain message event for a story mention", () => {
    const events = normalizeWebhook({
      object: "instagram",
      entry: [{
        id: "ig_1",
        messaging: [{
          sender: { id: "person_1" },
          recipient: { id: "ig_1" },
          timestamp: 1,
          message: { mid: "mid_story_2", attachments: [{ type: "story_mention", payload: {} }] },
        }],
      }],
    });
    expect(events.filter((event: NormalizedEvent) => event.type === "message.received")).toHaveLength(0);
  });
});

describe("first_contact and story_mention matching", () => {
  const mentionEvent: NormalizedEvent = {
    id: "mention_1",
    accountId: "ig_1",
    type: "story_mention.received",
    text: "",
    recipientId: "person_1",
    timestamp: 1,
  };

  it("fires first_contact only for genuinely new contacts", () => {
    expect(evaluateFlow(welcomeFlow, messageEvent(), { isNewContact: true }).status).toBe("matched");
    expect(evaluateFlow(welcomeFlow, messageEvent(), { isNewContact: false }).status).toBe("skipped");
    // Without runner-provided context the trigger never matches (safe default).
    expect(evaluateFlow(welcomeFlow, messageEvent()).status).toBe("skipped");
  });

  it("rejects conditions and comment+emailCapture combos at validation time", () => {
    expect(() =>
      validateFlowDefinition({ ...welcomeFlow, conditions: [{ type: "contains_keyword", keywords: ["hi"] }] }),
    ).toThrow();
    expect(() =>
      validateFlowDefinition({
        ...welcomeFlow,
        trigger: { type: "comment", match: "keyword", keywords: ["hi"], mediaIds: [] },
        actions: [{ type: "private_reply", text: "x" }],
        emailCapture: { promptText: "p", confirmationText: "c" },
      }),
    ).toThrow();
  });

  it("maps story-mention actions onto the mentioning person", () => {
    const evaluation = evaluateFlow(storyFlow, mentionEvent, {});
    expect(evaluation.status).toBe("matched");
    if (evaluation.status !== "matched") return;
    expect(evaluation.actions[0]).toEqual({ type: "send_text", recipientId: "person_1", text: "Thanks for the mention! 🧡" });
    expect(evaluation.actions[1]).toMatchObject({ type: "send_button", recipientId: "person_1" });
  });
});

describe("runner: conversation triggers end to end", () => {
  it("greets a new contact exactly once, then never again", async () => {
    const repository = await seed([welcomeFlow]);
    const client = createRunnerClient();

    const first = await processNormalizedEvent(messageEvent({ id: "m1", text: "hi there" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    const second = await processNormalizedEvent(messageEvent({ id: "m2", text: "hello again" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(first).toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(second.matched).toBe(0);
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);

    // A different person is still new.
    const otherPerson = await processNormalizedEvent(messageEvent({ id: "m3", recipientId: "person_2" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(otherPerson).toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
  });

  it("replies to a live story mention through the full pipeline", async () => {
    const repository = await seed([storyFlow]);
    const client = createRunnerClient();

    const result = await processNormalizedEvent(
      { id: "mention_live", accountId: "ig_1", type: "story_mention.received", text: "", recipientId: "person_7", timestamp: Date.now() },
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );

    expect(result).toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(client.sendDirectMessage).toHaveBeenCalledWith(
      { igUserId: "ig_1", accessToken: "access-token" },
      "person_7",
      { type: "text", text: "Thanks for the mention! 🧡" },
    );
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(2); // text + button
  });

  it("collects an email: keyword reply prompts, valid answer stores and confirms", async () => {
    const repository = await seed([captureFlow()]);
    const client = createRunnerClient();

    await processNormalizedEvent(messageEvent({ id: "c1", text: "guide please" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    const texts = vi.mocked(client.sendDirectMessage).mock.calls.map((call) => (call[2] as { text: string }).text);
    expect(texts.some((text) => text.includes("Here comes the guide!"))).toBe(true);
    expect(texts.some((text) => text.includes("What is your email?"))).toBe(true);

    const contact = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(contact?.state).toBe("AWAITING_EMAIL");

    const reply = await processNormalizedEvent(messageEvent({ id: "c2", text: "me@Example.COM" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(reply).toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });

    const stored = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(stored?.state).toBe("CAPTURED");
    expect(stored?.email).toBe("me@example.com");
    expect(await repository.countCapturedContacts("workspace_a")).toBe(1);
  });

  it("never lets the capture interception double-fire another autoresponder", async () => {
    const repository = await seed([
      captureFlow(),
      { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Default reply fired" }] },
    ]);
    const client = createRunnerClient();

    await processNormalizedEvent(messageEvent({ id: "d1", text: "guide" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    vi.mocked(client.sendDirectMessage).mockClear();

    const result = await processNormalizedEvent(messageEvent({ id: "d2", text: "me@example.com" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    // The capture flow handled it alone: one confirmation DM, no default reply.
    expect(result).toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });
    expect(vi.mocked(client.sendDirectMessage).mock.calls.map((call) => (call[2] as { text: string }).text))
      .toEqual(["You are in! ✅"]);
  });

  it("retries once per invalid reply and gives up after two", async () => {
    const repository = await seed([captureFlow()]);
    const client = createRunnerClient();

    await processNormalizedEvent(messageEvent({ id: "r0", text: "guide" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    const firstInvalid = await processNormalizedEvent(messageEvent({ id: "r1", text: "no idea" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(firstInvalid.sent).toBe(1); // retry ask sent

    const secondInvalid = await processNormalizedEvent(messageEvent({ id: "r2", text: "still not an email" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(secondInvalid.sent).toBe(1); // final retry ask

    const thirdInvalid = await processNormalizedEvent(messageEvent({ id: "r3", text: "lalala" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(thirdInvalid).toEqual({ matched: 0, sent: 0, skipped: 1, failed: 0 }); // gave up quietly

    const stored = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(stored?.state).toBe("NONE");
    // flow message + prompt, then two retry asks, then silence.
    const texts = vi.mocked(client.sendDirectMessage).mock.calls.map((call) => (call[2] as { text: string }).text);
    expect(texts.filter((text) => text.includes("try again"))).toHaveLength(2);
    expect(texts.at(-1)).toContain("try again");
  });

  it("captures instantly when the triggering message already contains an email", async () => {
    const repository = await seed([captureFlow()]);
    const client = createRunnerClient();

    const result = await processNormalizedEvent(
      messageEvent({ id: "i1", text: "guide → me@example.com" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );

    expect(result.sent).toBe(1);
    const texts = vi.mocked(client.sendDirectMessage).mock.calls.map((call) => (call[2] as { text: string }).text);
    expect(texts).toEqual(["Here comes the guide!", "You are in! ✅"]);
    const stored = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(stored?.state).toBe("CAPTURED");
    expect(stored?.email).toBe("me@example.com");
  });
});

describe("extractEmailAddress", () => {
  it("accepts real addresses inside freeform text and normalizes case", () => {
    expect(extractEmailAddress("sure it's Jamie.Doe+news@Shop.IO")).toBe("jamie.doe+news@shop.io");
    expect(extractEmailAddress("me@example.com")).toBe("me@example.com");
  });

  it("rejects lookalikes without a proper domain", () => {
    expect(extractEmailAddress("not an email @ all")).toBeUndefined();
    expect(extractEmailAddress("user@nodot")).toBeUndefined();
    expect(extractEmailAddress("")).toBeUndefined();
  });
});
