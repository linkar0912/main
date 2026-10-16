import { beforeEach, describe, expect, it, vi } from "vitest";

// --- conformance preamble: only Meta, Redis and BullMQ are faked -----------
vi.mock("server-only", () => ({}));
// Lead webhooks resolve their host before posting; answer without real DNS.
vi.mock("node:dns/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:dns/promises")>()),
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));
vi.mock("bullmq", async () => (await import("./fakes")).bullmqModule);
vi.mock("ioredis", async () => (await import("./fakes")).ioredisModule);
vi.mock("@/src/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/env")>();
  const { conformanceEnv } = await import("./fakes");
  return { ...actual, getServerEnv: () => conformanceEnv(actual.getServerEnv()) };
});
// The real module, minus what has side effects: no health server, and no
// liveness watchdog (a scenario's fake clock could otherwise trip it into
// process.exit).
vi.mock("@/src/lib/worker-health", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/worker-health")>()),
  createWorkerHealthServer: () => ({ listen() {}, unref() {}, close() {} }),
  workerHealthPort: () => 0,
  startLivenessWatchdog: () => () => undefined,
}));
vi.mock("@/src/lib/automation/background-tasks", async () => (await import("./fakes")).backgroundTasksModule);
vi.mock("@/src/lib/entitlements/memory-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/entitlements/memory-repository")>();
  const { planStore } = await import("./fakes");
  return {
    ...actual,
    // The plan's monthly allowance is whatever the scenario set (null = unlimited).
    createMemoryEntitlementRepository: (seed?: Parameters<typeof actual.createMemoryEntitlementRepository>[0]) => {
      const inner = actual.createMemoryEntitlementRepository(seed);
      return {
        ...inner,
        async getWorkspaceEntitlement(workspaceId: string) {
          const config = await inner.getWorkspaceEntitlement(workspaceId);
          return config && { ...config, plan: { ...config.plan, monthlyDeliveryLimit: planStore.monthlyDeliveryLimit } };
        },
      };
    },
  };
});
vi.mock("@/src/lib/auth/session", async () => ({
  getValidatedSession: async () => (await import("./fakes")).sessionStore.session,
}));
// ---------------------------------------------------------------------------

import { fakeMeta } from "./fakes";
import {
  addAutomation,
  deliverInstagram,
  IG_ACCOUNT,
  messagePayload,
  optinPayload,
  person,
  postbackPayload,
  queuedJobs,
  referralPayload,
  resetWorld,
  seedWorkspace,
  storyMentionPayload,
  WORKSPACE_ID,
} from "./harness";
import type { AutomationRepository } from "../../repository";
import type { FlowAction, FlowDefinitionV1 } from "../types";

let repository: AutomationRepository;

beforeEach(async () => {
  repository = await resetWorld();
  await seedWorkspace(repository);
});

function dmFlow(keywords: string[] | "any", actions: FlowAction[], extra: Partial<FlowDefinitionV1> = {}): FlowDefinitionV1 {
  return {
    version: 1,
    trigger: keywords === "any"
      ? { type: "message", match: "any", keywords: [] }
      : { type: "message", match: "keyword", keywords },
    conditions: [],
    actions,
    ...extra,
  };
}

const dms = () => fakeMeta.sends().filter((call) => call.kind === "direct_message");

describe("DM keyword replies", () => {
  it("answers a keyword DM with text, a button and an image, in order", async () => {
    await addAutomation(repository, "Price", dmFlow(["price"], [
      { type: "send_image", imageUrl: "https://cdn.example.com/prices.jpg", caption: "Our prices" },
      { type: "send_button", text: "Full catalogue", buttonLabel: "Open", url: "https://shop.example.com" },
    ]));
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "What's the PRICE?" }));

    expect(dms().map((call) => ({ to: call.recipient?.id, type: call.attachmentType ?? "text", text: call.text }))).toEqual([
      { to: sender, type: "image", text: undefined },
      { to: sender, type: "text", text: "Our prices" },
      { to: sender, type: "template", text: "Full catalogue" },
    ]);
    expect(dms()[0].body).toMatchObject({ message: { attachment: { payload: { url: "https://cdn.example.com/prices.jpg" } } } });
    expect(dms()[2].buttons).toEqual([{ type: "web_url", url: "https://shop.example.com", title: "Open" }]);
  });

  it("sends tappable quick replies, and a tap on one runs the matching keyword flow", async () => {
    await addAutomation(repository, "Menu", dmFlow(["menu"], [
      { type: "quick_replies", text: "What do you need?", replies: ["Prices", "Hours"] },
    ]));
    await addAutomation(repository, "Hours", dmFlow(["hours"], [{ type: "send_text", text: "We're open 10-7" }]));
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "menu" }));
    expect(dms()[0].quickReplies).toEqual([
      { content_type: "text", title: "Prices", payload: "Prices" },
      { content_type: "text", title: "Hours", payload: "Hours" },
    ]);

    // Meta sends the chip tap as a message carrying quick_reply.payload.
    await deliverInstagram(messagePayload({ from: sender, text: "Hours", quickReplyPayload: "Hours" }));
    expect(dms().at(-1)).toMatchObject({ recipient: { id: sender }, text: "We're open 10-7" });
  });

  it("runs a keyword flow from a postback button tap (conversation starters / persistent menu)", async () => {
    await addAutomation(repository, "Delivery", dmFlow(["delivery"], [{ type: "send_text", text: "Ships in 3 days" }]));
    const sender = person();
    await deliverInstagram(postbackPayload({ from: sender, payload: "DELIVERY", title: "Delivery info" }));
    expect(dms()).toEqual([expect.objectContaining({ recipient: { id: sender }, text: "Ships in 3 days" })]);
  });

  it("sends the default reply only when nothing else matched", async () => {
    await addAutomation(repository, "Default", dmFlow("any", [{ type: "send_text", text: "Thanks - a human will reply soon" }]));
    await addAutomation(repository, "Price", dmFlow(["price"], [{ type: "send_text", text: "Prices start at 499" }]));
    const sender = person();

    await deliverInstagram(messagePayload({ from: sender, text: "price?" }));
    expect(dms().map((call) => call.text)).toEqual(["Prices start at 499"]);

    await deliverInstagram(messagePayload({ from: sender, text: "do you ship to Pune?" }));
    expect(dms().map((call) => call.text)).toEqual(["Prices start at 499", "Thanks - a human will reply soon"]);
  });

  it("keeps the default reply quiet when a first-message welcome already answered", async () => {
    await addAutomation(repository, "Default", dmFlow("any", [{ type: "send_text", text: "Default" }]));
    await addAutomation(repository, "Welcome", { version: 1, trigger: { type: "first_contact" }, conditions: [], actions: [{ type: "send_text", text: "Welcome!" }] });
    await deliverInstagram(messagePayload({ from: person(), text: "hello" }));
    expect(dms().map((call) => call.text)).toEqual(["Welcome!"]);
  });

  it("runs every matching keyword flow by priority when several match", async () => {
    await addAutomation(repository, "Low", dmFlow(["price"], [{ type: "send_text", text: "low" }]), { priority: 1 });
    await addAutomation(repository, "High", dmFlow(["price"], [{ type: "send_text", text: "high" }]), { priority: 9 });
    await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    expect(dms().map((call) => call.text)).toEqual(["high", "low"]);
  });

  it("does not answer echoes, deleted messages or reactions-only events", async () => {
    await addAutomation(repository, "Default", dmFlow("any", [{ type: "send_text", text: "Default" }]));
    await deliverInstagram({
      object: "instagram",
      entry: [{ id: IG_ACCOUNT, time: Date.now(), messaging: [
        { sender: { id: IG_ACCOUNT }, recipient: { id: person() }, timestamp: Date.now(), message: { mid: "m_echo", text: "hi", is_echo: true } },
        { sender: { id: person() }, recipient: { id: IG_ACCOUNT }, timestamp: Date.now(), message: { mid: "m_del", is_deleted: true } },
        { sender: { id: person() }, recipient: { id: IG_ACCOUNT }, timestamp: Date.now(), reaction: { mid: "m_x", action: "react", reaction: "love" } },
      ] }],
    });
    expect(fakeMeta.calls).toHaveLength(0);
  });
});

describe("first-message welcome", () => {
  it("greets a person on their first ever message only", async () => {
    await addAutomation(repository, "Welcome", { version: 1, trigger: { type: "first_contact" }, conditions: [], actions: [{ type: "send_text", text: "Welcome!" }] });
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "hi" }));
    await deliverInstagram(messagePayload({ from: sender, text: "hi again", at: Date.now() + 1_000 }));
    expect(dms().map((call) => call.text)).toEqual(["Welcome!"]);
  });

  it("does not greet someone who already talked to the account before the welcome existed", async () => {
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "hi", at: Date.now() - 60_000 }));
    await addAutomation(repository, "Welcome", { version: 1, trigger: { type: "first_contact" }, conditions: [], actions: [{ type: "send_text", text: "Welcome!" }] });
    await deliverInstagram(messagePayload({ from: sender, text: "hello" }));
    expect(dms()).toHaveLength(0);
  });
});

describe("stories, ads and opt-ins", () => {
  it("thanks a person for a story mention, without the default reply also firing", async () => {
    await addAutomation(repository, "Default", dmFlow("any", [{ type: "send_text", text: "Default" }]));
    await addAutomation(repository, "Mention", { version: 1, trigger: { type: "story_mention" }, conditions: [], actions: [
      { type: "send_text", text: "Thanks for the mention!" },
      { type: "send_button", text: "A gift", buttonLabel: "Claim", url: "https://shop.example.com/gift" },
    ] });
    const sender = person();
    await deliverInstagram(storyMentionPayload({ from: sender }));
    expect(dms().map((call) => call.text)).toEqual(["Thanks for the mention!", "A gift"]);
  });

  it("answers a keyword reply to a Story with the link, and leaves other story replies to the inbox", async () => {
    await addAutomation(repository, "Story link", { version: 1, trigger: { type: "story_reply", match: "keyword", keywords: ["link"] }, conditions: [], actions: [
      { type: "send_button", text: "Here's the link", buttonLabel: "Open", url: "https://shop.example.com/story" },
    ] });
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "LINK", storyId: "story_1" }));
    await deliverInstagram(messagePayload({ from: sender, text: "love this", storyId: "story_1" }));
    await deliverInstagram(messagePayload({ from: sender, text: "link", }));
    expect(dms().map((call) => call.text)).toEqual(["Here's the link"]);
  });

  it("lets a story-reply flow own the reply so a plain keyword flow doesn't double-answer", async () => {
    await addAutomation(repository, "Story link", { version: 1, trigger: { type: "story_reply", match: "keyword", keywords: ["link"] }, conditions: [], actions: [{ type: "send_text", text: "story" }] });
    await addAutomation(repository, "Keyword", dmFlow(["link"], [{ type: "send_text", text: "keyword" }]));
    await deliverInstagram(messagePayload({ from: person(), text: "link", storyId: "story_2" }));
    expect(dms().map((call) => call.text)).toEqual(["story"]);
  });

  it("welcomes someone arriving from an ad (referral)", async () => {
    await addAutomation(repository, "Ad", { version: 1, trigger: { type: "referral" }, conditions: [], actions: [{ type: "send_text", text: "Thanks for tapping the ad!" }] });
    const sender = person();
    await deliverInstagram(referralPayload({ from: sender, ref: "diwali_sale" }));
    expect(dms()).toEqual([expect.objectContaining({ recipient: { id: sender }, text: "Thanks for tapping the ad!" })]);
  });

  it("confirms an opt-in button tap", async () => {
    await addAutomation(repository, "Opt-in", { version: 1, trigger: { type: "optin" }, conditions: [], actions: [
      { type: "send_button", text: "You're confirmed!", buttonLabel: "Next", url: "https://example.com/welcome" },
    ] });
    const sender = person();
    await deliverInstagram(optinPayload({ from: sender }));
    expect(dms()).toEqual([expect.objectContaining({ recipient: { id: sender }, text: "You're confirmed!" })]);
  });
});

describe("email capture", () => {
  const capture: FlowDefinitionV1 = dmFlow(["guide"], [{ type: "send_text", text: "Here's your guide!" }], {
    emailCapture: {
      promptText: "What's your email?",
      retryText: "That doesn't look like an email - try again?",
      confirmationText: "You're in!",
      delivery: { subject: "Your guide", message: "Thanks!", linkUrl: "https://example.com/guide" },
      notifyUrl: "https://hooks.example.com/lead",
    },
  });

  it("asks, rejects an invalid address politely, accepts a valid one and stores it with attribution", async () => {
    const automation = await addAutomation(repository, "Capture", capture);
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "guide" }));
    expect(dms().map((call) => call.text)).toEqual(["Here's your guide!", "What's your email?"]);
    expect(await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, sender)).toMatchObject({ state: "AWAITING_EMAIL", awaitingAutomationId: automation.id });

    await deliverInstagram(messagePayload({ from: sender, text: "asha at gmail" }));
    expect(dms().at(-1)?.text).toBe("That doesn't look like an email - try again?");

    await deliverInstagram(messagePayload({ from: sender, text: "sure, it's Asha@Example.com" }));
    expect(dms().at(-1)?.text).toBe("You're in!");
    const contact = await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, sender);
    expect(contact).toMatchObject({ email: "asha@example.com", state: "CAPTURED", emailCapturedBy: automation.id });

    // The lead email and the CRM webhook were queued and delivered.
    expect(queuedJobs("lead-delivery").map((job) => job.data.kind).sort()).toEqual(["LEAD_EMAIL", "LEAD_WEBHOOK"]);
    const hook = fakeMeta.calls.find((call) => call.kind === "external" && call.host === "hooks.example.com");
    expect(hook?.body).toMatchObject({ email: "asha@example.com", automationId: automation.id });
  });

  it("stops asking after the retry budget instead of looping", async () => {
    await addAutomation(repository, "Capture", capture);
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "guide" }));
    for (const text of ["no", "nope", "still no", "nah"]) await deliverInstagram(messagePayload({ from: sender, text }));
    expect(dms().filter((call) => call.text === "That doesn't look like an email - try again?")).toHaveLength(2);
    expect((await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, sender))?.state).not.toBe("AWAITING_EMAIL");
  });

  it("captures an address sent together with the keyword in one message", async () => {
    await addAutomation(repository, "Capture", capture);
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "guide please - me@example.org" }));
    expect(dms().map((call) => call.text)).toEqual(["Here's your guide!", "You're in!"]);
    expect((await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, sender))?.email).toBe("me@example.org");
  });

  it("treats STOP mid-capture as an opt-out, not as a bad email", async () => {
    await addAutomation(repository, "Capture", capture);
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "guide" }));
    await deliverInstagram(messagePayload({ from: sender, text: "STOP" }));
    expect(dms().at(-1)?.text).toMatch(/won't receive any more automated messages/);
    const contact = await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, sender);
    expect(contact?.suppressedAt).toBeTruthy();
    await deliverInstagram(messagePayload({ from: sender, text: "guide" }));
    expect(dms().at(-1)?.text).toMatch(/won't receive any more automated messages/);
  });

  it("runs a conversational form (event registration) and validates typed answers", async () => {
    const automation = await addAutomation(repository, "Event", dmFlow(["webinar"], [{ type: "send_text", text: "Let's get you registered" }], {
      emailCapture: {
        promptText: "Email?",
        confirmationText: "Seat confirmed!",
        fields: [
          { id: "name", question: "Your name?", kind: "text" },
          { id: "phone", question: "Phone?", kind: "phone" },
        ],
      },
    }));
    const sender = person();
    for (const text of ["webinar", "a@b.co", "Asha", "call me", "+91 98765 43210"]) {
      await deliverInstagram(messagePayload({ from: sender, text }));
    }
    expect(dms().map((call) => call.text)).toEqual(["Let's get you registered", "Email?", "Your name?", "Phone?", "Phone?", "Seat confirmed!"]);
    expect(await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, sender)).toMatchObject({
      email: "a@b.co",
      state: "CAPTURED",
      fields: { name: "Asha", phone: "+919876543210" },
      emailCapturedBy: automation.id,
    });
  });
});

describe("offer + timed follow-up", () => {
  it("schedules the follow-up nudge and delivers it later inside the 24-hour window", async () => {
    await addAutomation(repository, "Offer", dmFlow(["offer"], [
      { type: "send_button", text: "20% off", buttonLabel: "Claim", url: "https://shop.example.com/offer" },
    ], { followUps: [{ delayMinutes: 60, text: "Still interested?", buttonLabel: "Use code", url: "https://shop.example.com/offer" }] }));
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "offer" }));
    const [followUp] = queuedJobs("flow-followup");
    expect(followUp).toMatchObject({ state: "delayed", opts: expect.objectContaining({ delay: 60 * 60_000 }) });

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 61 * 60_000);
      const { drain } = await import("./harness");
      await drain();
    } finally {
      vi.useRealTimers();
    }
    expect(dms().at(-1)).toMatchObject({ recipient: { id: sender }, text: "Still interested?" });
  });

  it("skips the follow-up once the person opted out", async () => {
    await addAutomation(repository, "Offer", dmFlow(["offer"], [{ type: "send_text", text: "20% off" }], {
      followUps: [{ delayMinutes: 30, text: "Still interested?" }],
    }));
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "offer" }));
    await deliverInstagram(messagePayload({ from: sender, text: "stop" }));
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 31 * 60_000);
      const { drain } = await import("./harness");
      await drain();
    } finally {
      vi.useRealTimers();
    }
    expect(dms().some((call) => call.text === "Still interested?")).toBe(false);
  });
});
