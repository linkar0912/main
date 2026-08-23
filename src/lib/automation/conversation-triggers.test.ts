import { describe, expect, it, vi } from "vitest";
import type { FlowDefinitionV1, NormalizedEvent } from "./types";
import { evaluateFlow } from "./engine";
import { extractEmailAddress, processNormalizedEvent, type AutomationRunnerClient } from "./runner";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { normalizeWebhook } from "../meta/webhooks";
import { validateFlowDefinition } from "./definition";
import { sendEmail } from "../mailer";
import { MetaApiError } from "../meta/client";

vi.mock("../mailer", () => ({ sendEmail: vi.fn().mockResolvedValue({ delivered: true }) }));
const mockedSendEmail = vi.mocked(sendEmail);

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
      delivery: {
        subject: "Your guide, as promised",
        message: "Thanks for subscribing! Here it is.",
        linkUrl: "https://example.com/guide.pdf",
        linkLabel: "Download the guide",
      },
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

  it("retries the confirmation without replaying the original automation", async () => {
    const repository = await seed([captureFlow()]);
    const client = createRunnerClient();
    await processNormalizedEvent(messageEvent({ id: "resume_0", text: "guide" }), repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    });
    vi.mocked(client.sendDirectMessage).mockClear();
    vi.mocked(client.sendDirectMessage)
      .mockRejectedValueOnce(new MetaApiError("temporarily unavailable", 503))
      .mockResolvedValueOnce({ recipient_id: "person_1", message_id: "confirmation" });
    const reply = messageEvent({ id: "resume_1", text: "lead@example.com" });

    await expect(processNormalizedEvent(reply, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    })).rejects.toThrow("temporarily unavailable");
    expect(await repository.getContact("workspace_a", "ig_1", "person_1"))
      .toMatchObject({ state: "AWAITING_EMAIL", email: "lead@example.com" });

    await expect(processNormalizedEvent(reply, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    })).resolves.toEqual({ matched: 1, sent: 1, skipped: 0, failed: 0 });

    expect(vi.mocked(client.sendDirectMessage).mock.calls.map(
      (call) => (call[2] as { text: string }).text,
    )).toEqual(["You are in! ✅", "You are in! ✅"]);
    expect((await repository.getContact("workspace_a", "ig_1", "person_1"))?.state)
      .toBe("CAPTURED");
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

  it("retries contact finalization without resending already delivered actions", async () => {
    const repository = await seed([captureFlow()]);
    const client = createRunnerClient();
    const captureContactEmail = repository.captureContactEmail.bind(repository);
    repository.captureContactEmail = vi.fn()
      .mockRejectedValueOnce(new Error("contact write unavailable"))
      .mockImplementation(captureContactEmail);
    const incoming = messageEvent({ id: "instant_resume", text: "guide → saved@example.com" });

    await expect(processNormalizedEvent(incoming, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    })).rejects.toThrow("contact write unavailable");
    await expect(processNormalizedEvent(incoming, repository, {
      client,
      tokenEncryptionKey: TOKEN_KEY,
    })).resolves.toMatchObject({ sent: 1, failed: 0 });

    expect(vi.mocked(client.sendDirectMessage).mock.calls.map(
      (call) => (call[2] as { text: string }).text,
    )).toEqual(["Here comes the guide!", "You are in! ✅"]);
    expect(await repository.getContact("workspace_a", "ig_1", "person_1"))
      .toMatchObject({ state: "CAPTURED", email: "saved@example.com" });
  });
});

describe("validation: email delivery configuration", () => {
  const base = {
    version: 1,
    trigger: { type: "message", match: "keyword", keywords: ["guide"] },
    conditions: [],
    actions: [{ type: "send_text", text: "x" }],
    emailCapture: {
      promptText: "email?",
      confirmationText: "done",
      delivery: { subject: "Guide", message: "Here.", linkLabel: "Download" },
    },
  };

  it("rejects a link label without a link URL", () => {
    expect(() => validateFlowDefinition(base)).toThrow();
  });

  it("accepts a complete delivery block and normalizes it", () => {
    const normalized = validateFlowDefinition({
      ...base,
      emailCapture: { ...base.emailCapture, delivery: { ...base.emailCapture.delivery, linkUrl: "https://x.dev/g" } },
    });
    if (normalized.version !== 1 || !normalized.emailCapture?.delivery) throw new Error("expected V1 delivery");
    expect(normalized.emailCapture.delivery.linkUrl).toBe("https://x.dev/g");
    expect(normalized.emailCapture.delivery.linkLabel).toBe("Download");
  });
});

describe("conversational fields", () => {
  function fieldsFlow(): FlowDefinitionV1 {
    return {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["guide"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Guide incoming!" }],
      emailCapture: {
        promptText: "Email?",
        confirmationText: "All set ✅",
        fields: [
          { id: "name", question: "What is your name?" },
          { id: "city", question: "Which city?" },
        ],
      },
    };
  }

  it("asks every field after the email and stores all answers", async () => {
    const repository = await seed([fieldsFlow()]);
    const client = createRunnerClient();

    await processNormalizedEvent(messageEvent({ id: "c0", text: "guide" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    await processNormalizedEvent(messageEvent({ id: "c1", text: "me@example.com" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    // Question 1 asked right after the email lands.
    let texts = vi.mocked(client.sendDirectMessage).mock.calls.map((call) => (call[2] as { text: string }).text);
    expect(texts.at(-1)).toBe("What is your name?");

    await processNormalizedEvent(messageEvent({ id: "c2", text: "Ada Lovelace" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    texts = vi.mocked(client.sendDirectMessage).mock.calls.map((call) => (call[2] as { text: string }).text);
    expect(texts.at(-1)).toBe("Which city?");

    await processNormalizedEvent(messageEvent({ id: "c3", text: "London" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    texts = vi.mocked(client.sendDirectMessage).mock.calls.map((call) => (call[2] as { text: string }).text);
    expect(texts.at(-1)).toBe("All set ✅");

    const stored = await repository.getContact("workspace_a", "ig_1", "person_1");
    expect(stored?.state).toBe("CAPTURED");
    expect(stored?.fields).toEqual({ name: "Ada Lovelace", city: "London" });
    expect(await repository.countCapturedContacts("workspace_a")).toBe(1);
  });

  it("includes collected fields in the lead webhook payload", async () => {
    mockedSendEmail.mockClear();
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const repository = await seed([
        {
          version: 1,
          trigger: { type: "message", match: "keyword", keywords: ["guide"] },
          conditions: [],
          actions: [{ type: "send_text", text: "Guide!" }],
          emailCapture: {
            promptText: "Email?",
            confirmationText: "Done",
            notifyUrl: "https://hooks.example.com/lead",
            fields: [{ id: "name", question: "Name?" }],
          },
        },
      ]);
      const client = createRunnerClient();
      await processNormalizedEvent(messageEvent({ id: "w0", text: "guide" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
      await processNormalizedEvent(messageEvent({ id: "w1", text: "lead@example.com" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
      await processNormalizedEvent(messageEvent({ id: "w2", text: "Grace Hopper" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });

      const webhookCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("hooks.example.com"));
      expect(webhookCalls).toHaveLength(1);
      expect(JSON.parse(webhookCalls[0][1].body as string)).toMatchObject({
        email: "lead@example.com",
        fields: { name: "Grace Hopper" },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects duplicate field ids at validation time", () => {
    expect(() =>
      validateFlowDefinition({
        version: 1,
        trigger: { type: "message", match: "any", keywords: [] },
        conditions: [],
        actions: [{ type: "send_text", text: "x" }],
        emailCapture: {
          promptText: "p",
          confirmationText: "c",
          fields: [
            { id: "a", question: "one" },
            { id: "a", question: "two" },
          ],
        },
      }),
    ).toThrow();
  });
});

describe("opt-out handling", () => {
  function optOutFlow(): FlowDefinitionV1 {
    return { version: 1, trigger: { type: "first_contact" }, conditions: [], actions: [{ type: "send_text", text: "Welcome!" }] };
  }

  it("suppresses STOP senders, confirms once, and silences every engine afterwards", async () => {
    const repository = await seed([captureFlow()]);
    const client = createRunnerClient();

    await processNormalizedEvent(messageEvent({ id: "o0", text: "guide" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    vi.mocked(client.sendDirectMessage).mockClear();

    const stop = await processNormalizedEvent(messageEvent({ id: "o1", text: "STOP" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(stop.sent).toBe(1); // one final confirmation DM
    expect((await repository.getContact("workspace_a", "ig_1", "person_1"))?.suppressedAt).toBeTruthy();

    vi.mocked(client.sendDirectMessage).mockClear();
    const keywordAttempt = await processNormalizedEvent(messageEvent({ id: "o2", text: "guide again" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(keywordAttempt).toEqual({ matched: 0, sent: 0, skipped: 0, failed: 0 });
    const repeatStop = await processNormalizedEvent(messageEvent({ id: "o3", text: "unsubscribe" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(repeatStop.sent).toBe(0); // no duplicate confirmation
    expect(client.sendDirectMessage).not.toHaveBeenCalled();
    expect(await repository.countCapturedContacts("workspace_a")).toBe(0);
  });

  it("never greets someone whose very first message is an opt-out", async () => {
    const repository = await seed([optOutFlow()]);
    const client = createRunnerClient();

    const result = await processNormalizedEvent(messageEvent({ id: "n0", text: "remove me" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(result.sent).toBe(1); // only the opt-out confirmation
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);

    const later = await processNormalizedEvent(messageEvent({ id: "n1", text: "actually hi" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect(later.matched).toBe(0);
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect((await repository.getContact("workspace_a", "ig_1", "person_1"))?.suppressedAt).toBeTruthy();
  });

  it("keeps treating ordinary sentences as normal messages", async () => {
    const repository = await seed([captureFlow()]);
    const client = createRunnerClient();

    await processNormalizedEvent(messageEvent({ id: "k0", text: "where do we stop by for pickup?" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    expect((await repository.getContact("workspace_a", "ig_1", "person_1"))?.suppressedAt).toBeFalsy();
  });
});

describe("lead fulfillment emails", () => {
  it("emails the deliverable the moment an address is stored", async () => {
    const repository = await seed([captureFlow()]);
    const client = createRunnerClient();

    await processNormalizedEvent(messageEvent({ id: "f1", text: "guide please" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });
    mockedSendEmail.mockClear();
    await processNormalizedEvent(messageEvent({ id: "f2", text: "me@example.com" }), repository, { client, tokenEncryptionKey: TOKEN_KEY });

    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
    const payload = mockedSendEmail.mock.calls[0][0];
    expect(payload.to).toBe("me@example.com");
    expect(payload.subject).toContain("guide");
    expect(payload.body).toContain("https://example.com/guide.pdf");
    expect(payload.body.toLowerCase()).toContain("stop");
  });

  it("posts the lead to the configured webhook URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const repository = await seed([
        {
          version: 1,
          trigger: { type: "message", match: "keyword", keywords: ["guide"] },
          conditions: [],
          actions: [{ type: "send_text", text: "Guide!" }],
          emailCapture: {
            promptText: "Email?",
            confirmationText: "In!",
            notifyUrl: "https://hooks.zapier.com/hook/123",
          },
        },
      ]);
      const client = createRunnerClient();

      await processNormalizedEvent(
        messageEvent({ id: "w1", text: "guide → hooked@lead.dev" }),
        repository,
        { client, tokenEncryptionKey: TOKEN_KEY },
      );

      const webhookCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("hooks.zapier.com"));
      expect(webhookCalls).toHaveLength(1);
      const sentBody = JSON.parse(webhookCalls[0][1].body as string);
      expect(sentBody).toMatchObject({ email: "hooked@lead.dev", automationName: "Automation 0" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("captures embedded emails instantly and fulfills without a prompt round-trip", async () => {
    const repository = await seed([captureFlow()]);
    const client = createRunnerClient();
    mockedSendEmail.mockClear();

    await processNormalizedEvent(
      messageEvent({ id: "f3", text: "guide → instant@lead.dev" }),
      repository,
      { client, tokenEncryptionKey: TOKEN_KEY },
    );

    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
    expect(mockedSendEmail.mock.calls[0][0].to).toBe("instant@lead.dev");
    expect((await repository.getContact("workspace_a", "ig_1", "person_1"))?.state).toBe("CAPTURED");
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
