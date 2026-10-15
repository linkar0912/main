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
vi.mock("@/src/lib/worker-health", () => ({
  createWorkerHealthServer: () => ({ listen() {}, unref() {}, close() {} }),
  workerHealthPort: () => 0,
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

import { envOverrides, fakeMeta } from "./fakes";
import {
  addAutomation,
  commentPayload,
  deliverInstagram,
  echoPayload,
  IG_ACCOUNT,
  IG_USERNAME,
  messagePayload,
  person,
  postInstagramWebhook,
  queuedJobs,
  resetWorld,
  runSweep,
  seedWorkspace,
  setMonthlyDeliveryLimit,
  WORKSPACE_ID,
  drain,
} from "./harness";
import type { AutomationRepository } from "../../repository";
import type { FlowDefinitionV1 } from "../types";
import { deriveAttentionItems } from "../../home-attention";
import { INTERRUPTED_BEFORE_SENDING, INTERRUPTED_WHILE_SENDING } from "../execution-reconciliation";
import { resetAccountPauseStateForTests } from "../account-pause";

let repository: AutomationRepository;

beforeEach(async () => {
  repository = await resetWorld();
  await seedWorkspace(repository);
  // Account pauses and cool-downs live in process memory when Redis is faked.
  resetAccountPauseStateForTests();
});

const keywordReply: FlowDefinitionV1 = {
  version: 1,
  trigger: { type: "message", match: "keyword", keywords: ["price"] },
  conditions: [],
  actions: [{ type: "send_text", text: "Prices start at 499" }],
};
const commentReply: FlowDefinitionV1 = {
  version: 1,
  trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply", text: "Here you go" }],
};
const dms = () => fakeMeta.sends().filter((call) => call.kind === "direct_message");

async function withClock<T>(at: number, run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(at);
    return await run();
  } finally {
    vi.useRealTimers();
  }
}

describe("opt-outs and suppression", () => {
  it("confirms STOP once and never messages that person again from any automation", async () => {
    await addAutomation(repository, "Price", keywordReply);
    await addAutomation(repository, "Guide", commentReply);
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "STOP" }));
    expect(dms().map((call) => call.text)).toEqual([expect.stringMatching(/won't receive any more automated messages/)]);

    await deliverInstagram(messagePayload({ from: sender, text: "price" }));
    await deliverInstagram(messagePayload({ from: sender, text: "stop" }));
    await deliverInstagram(commentPayload({ from: sender, text: "guide" }));
    expect(fakeMeta.sends()).toHaveLength(1);
    expect((await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, sender))?.suppressedAt).toBeTruthy();
  });

  it("treats 'stop' inside a sentence as a normal message", async () => {
    await addAutomation(repository, "Price", keywordReply);
    await deliverInstagram(messagePayload({ from: person(), text: "don't stop the price drops" }));
    expect(dms().map((call) => call.text)).toEqual(["Prices start at 499"]);
  });
});

describe("send limits", () => {
  it("honours an automation's daily send cap", async () => {
    const automation = await addAutomation(repository, "Price", { ...keywordReply, dailySendLimit: 2 });
    for (let index = 0; index < 3; index += 1) await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    expect(dms()).toHaveLength(2);
    const executions = await repository.listAutomationExecutions(WORKSPACE_ID, automation.id, 10);
    expect(executions.filter((execution) => execution.status === "SKIPPED").map((execution) => execution.reason)).toEqual(["daily_send_limit_reached"]);
  });

  it("stops at the plan's monthly limit, records that reason, and Home says replies are paused", async () => {
    const automation = await addAutomation(repository, "Price", keywordReply);
    await setMonthlyDeliveryLimit(1);
    await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    expect(dms()).toHaveLength(1);

    const executions = await repository.listAutomationExecutions(WORKSPACE_ID, automation.id, 10);
    expect(executions.find((execution) => execution.status === "FAILED")?.reason).toBe("Monthly delivery limit reached");

    // Home's "Needs you", fed by the same APIs the dashboard calls.
    const { GET: failuresGet } = await import("@/app/api/insights/failures/route");
    const failures = (await (await failuresGet(new Request("https://app.linkar.test/api/insights/failures"))).json()).data;
    const items = deriveAttentionItems({
      connections: [{ kind: "instagram", name: IG_USERNAME, status: "CONNECTED" }],
      automations: [{ id: automation.id, name: automation.name, status: "ACTIVE" }],
      automationsKnown: true,
      failures,
      usage: null,
    });
    expect(items).toEqual([expect.objectContaining({
      chip: "Limit reached",
      text: expect.stringMatching(/^Monthly limit reached - replies are paused until \d{1,2} \w+ or you upgrade\.$/),
      action: { kind: "link", label: "Upgrade", href: "/settings?section=billing" },
    })]);
  });
});

describe("Meta errors", () => {
  it("waits minutes, not seconds, after Meta throttles a send, then delivers it once", async () => {
    await addAutomation(repository, "Price", keywordReply);
    fakeMeta.fail((call) => call.kind === "direct_message", { status: 400, error: { message: "Application request limit reached", code: 4 } });
    const report = await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    const [job] = queuedJobs("instagram-event");
    expect(job.opts).toMatchObject({ attempts: 6, backoff: { type: "exponential", delay: 60_000, jitter: 0.5 } });
    // Parked for about a minute without spending a retry attempt.
    expect(report.deferred).toHaveLength(1);
    expect(job).toMatchObject({ state: "delayed", attemptsMade: 0 });
    expect(job.processAt - Date.now()).toBeGreaterThan(55_000);
    expect((await drain()).completed).toHaveLength(0);
    expect(dms()).toHaveLength(1);

    const later = await withClock(Date.now() + 2 * 60_000 + 1_000, () => drain());
    expect(later.completed).toHaveLength(1);
    expect(dms()).toHaveLength(2);
    expect(dms().at(-1)?.text).toBe("Prices start at 499");
  });

  it("stops sending for the account when Meta blocks it, and Home says until when", async () => {
    const automation = await addAutomation(repository, "Price", keywordReply);
    fakeMeta.fail((call) => call.kind === "direct_message", {
      status: 400,
      error: { message: "(#2022) The business has been blocked from sending messages via the IG Messaging API", code: 10 },
    });
    const first = person();
    await deliverInstagram(messagePayload({ from: first, text: "price" }));
    expect(dms()).toHaveLength(1);
    const [refused] = await repository.listOutboundDeliveriesForRecipient(WORKSPACE_ID, IG_ACCOUNT, first, 5);
    expect(refused).toMatchObject({ state: "FAILED", retryable: false, resultCode: "PROVIDER_REJECTED" });
    expect(refused.lastError).toBe("Instagram has limited this account. Linkar paused automatic replies on it for 24 hours.");

    // New triggers stop at the pause instead of calling Meta again.
    const second = person();
    const report = await deliverInstagram(messagePayload({ from: second, text: "price" }));
    expect(report.failed).toHaveLength(0);
    expect(dms()).toHaveLength(1);
    const [held] = await repository.listOutboundDeliveriesForRecipient(WORKSPACE_ID, IG_ACCOUNT, second, 5);
    expect(held).toMatchObject({ state: "FAILED", retryable: false, resultCode: "SUPPRESSED" });

    const { GET: failuresGet } = await import("@/app/api/insights/failures/route");
    const failures = (await (await failuresGet(new Request("https://app.linkar.test/api/insights/failures"))).json()).data;
    const items = deriveAttentionItems({
      connections: [{ kind: "instagram", name: IG_USERNAME, status: "CONNECTED" }],
      automations: [{ id: automation.id, name: automation.name, status: "ACTIVE" }],
      automationsKnown: true,
      failures,
      usage: null,
    });
    expect(items).toEqual([expect.objectContaining({
      key: "account-paused",
      chip: "Limited",
      text: expect.stringMatching(/^Instagram has limited one of your accounts\. Linkar paused its automatic replies until .+\.$/),
    })]);

    // After the pause the account sends again (slowly).
    await withClock(Date.now() + 25 * 60 * 60_000, () => deliverInstagram(messagePayload({ from: person(), text: "price" })));
    expect(dms()).toHaveLength(2);
  });

  it("fails a permanent rejection once, with a readable English reason", async () => {
    await addAutomation(repository, "Price", keywordReply);
    fakeMeta.fail((call) => call.kind === "direct_message", {
      status: 400,
      error: { message: "Der gesuchte Nutzer wurde nicht gefunden.", code: 100, error_subcode: 2018001 },
    });
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "price" }));
    expect(dms()).toHaveLength(1);
    const [delivery] = await repository.listOutboundDeliveriesForRecipient(WORKSPACE_ID, IG_ACCOUNT, sender, 5);
    expect(delivery).toMatchObject({ state: "FAILED", retryable: false, resultCode: "PROVIDER_REJECTED" });
    expect(delivery.lastError).toBe("Instagram couldn't find this person. They may have blocked the account or deleted their profile.");
  });

  it("does not resend when Meta's answer was lost (ambiguous outcome)", async () => {
    await addAutomation(repository, "Price", keywordReply);
    fakeMeta.fail((call) => call.kind === "direct_message", { status: 0, network: true });
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "price" }));
    expect(dms()).toHaveLength(1);
    const [delivery] = await repository.listOutboundDeliveriesForRecipient(WORKSPACE_ID, IG_ACCOUNT, sender, 5);
    expect(delivery.state).toBe("UNKNOWN");
  });

  it("marks the connection expired on an invalid token and Home asks the owner to reconnect", async () => {
    await addAutomation(repository, "Price", keywordReply);
    fakeMeta.fail((call) => call.kind === "direct_message", {
      status: 400,
      error: { message: "Error validating access token: Session has expired", code: 190, error_subcode: 463 },
    });
    await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    const [connection] = await repository.listConnections(WORKSPACE_ID);
    expect(connection.status).toBe("EXPIRED");
    const items = deriveAttentionItems({
      connections: [{ kind: "instagram", name: connection.username, status: connection.status }],
      automations: [], automationsKnown: true, failures: [], usage: null,
    });
    expect(items[0]).toMatchObject({ chip: "Expired", action: { label: "Reconnect", href: "/settings" } });

    // Nothing more is attempted on the expired connection.
    const callsBefore = fakeMeta.calls.length;
    await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    expect(fakeMeta.calls).toHaveLength(callsBefore);
  });

  it("parks sends past the account's hourly ceiling instead of failing them", async () => {
    envOverrides.directMessageRateLimitPerHour = 1;
    await addAutomation(repository, "Price", keywordReply);
    await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    const report = await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    expect(dms()).toHaveLength(1);
    expect(report.deferred).toHaveLength(1);
    expect(report.deferred[0]).toMatchObject({ state: "delayed", attemptsMade: 0 });
  });
});

describe("24-hour window and private-reply window", () => {
  it("never sends a follow-up after the person's 24-hour window closed", async () => {
    await addAutomation(repository, "Offer", {
      ...keywordReply,
      followUps: [{ delayMinutes: 25 * 60, text: "Still interested?" }],
    });
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "price" }));
    await withClock(Date.now() + 26 * 60 * 60_000, () => drain());
    expect(dms().map((call) => call.text)).toEqual(["Prices start at 499"]);
    const followUp = (await repository.listOutboundDeliveriesForRecipient(WORKSPACE_ID, IG_ACCOUNT, sender, 5))
      .find((delivery) => delivery.kind === "FLOW_FOLLOWUP");
    expect(followUp).toMatchObject({ state: "FAILED", resultCode: "WINDOW_CLOSED" });
  });
});

describe("quiet hours", () => {
  it("never delays an immediate reply - DM or comment campaign - during quiet hours", async () => {
    const hour = new Date().getUTCHours();
    await repository.setMessagingWindow(WORKSPACE_ID, { startHour: hour, endHour: (hour + 2) % 24, timezone: "UTC" });
    await addAutomation(repository, "Price", keywordReply);
    await addAutomation(repository, "Launch", {
      version: 2,
      trigger: { type: "comment", source: "all_media", mediaIds: [], mediaSnapshots: [], match: "any", keywords: [] },
      publicReplies: ["Check your DMs"],
      openingMessage: { text: "Tap for the link", optInButtonLabel: "Send it" },
      followGate: { required: false, notFollowingMessage: "", recheckButtonLabel: "" },
      delivery: { text: "Here", url: "https://shop.example.com" },
    });
    fakeMeta.media.set("media_1", { id: "media_1", media_type: "IMAGE", permalink: "https://www.instagram.com/p/1/", timestamp: new Date().toISOString() });
    await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    const report = await deliverInstagram(commentPayload({ from: person(), text: "nice" }));
    expect(report.deferred).toHaveLength(0);
    expect(fakeMeta.sends().map((call) => call.kind).sort()).toEqual(["direct_message", "private_reply", "public_reply"]);
  });

  it("holds a scheduled follow-up during quiet hours", async () => {
    const hour = new Date().getUTCHours();
    await addAutomation(repository, "Offer", { ...keywordReply, followUps: [{ delayMinutes: 1, text: "Nudge" }] });
    await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    await repository.setMessagingWindow(WORKSPACE_ID, { startHour: hour, endHour: (hour + 3) % 24, timezone: "UTC" });
    const report = await withClock(Date.now() + 2 * 60_000, () => drain());
    expect(report.deferred).toHaveLength(1);
    expect(dms().map((call) => call.text)).toEqual(["Prices start at 499"]);
  });
});

describe("human takeover", () => {
  it("pauses automations for a person after a teammate replies from the Instagram app", async () => {
    await addAutomation(repository, "Price", keywordReply);
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "hello?" }));
    await postInstagramWebhook(echoPayload({ to: sender, text: "Hi! I'm Kavya, how can I help?" }));
    await withClock(Date.now() + 9_000, () => drain());
    expect((await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, sender))?.automationsPausedReason).toBe("manual_reply");

    await deliverInstagram(messagePayload({ from: sender, text: "price" }));
    expect(dms()).toHaveLength(0);
    // Other people still get answers.
    await deliverInstagram(messagePayload({ from: person(), text: "price" }));
    expect(dms()).toHaveLength(1);
  });

  it("does not pause for the echo of Linkar's own automated reply", async () => {
    await addAutomation(repository, "Price", keywordReply);
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "price" }));
    await postInstagramWebhook(echoPayload({ to: sender, text: "Prices start at 499", mid: "mid_1" }));
    await withClock(Date.now() + 9_000, () => drain());
    expect((await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, sender))?.automationsPausedUntil).toBeUndefined();
  });

  it("pauses automations after a reply from the Linkar inbox, and the inbox shows who spoke last", async () => {
    await addAutomation(repository, "Price", { ...keywordReply, trigger: { type: "message", match: "keyword", keywords: ["menu"] } });
    const sender = person();
    await deliverInstagram(messagePayload({ from: sender, text: "do you ship to Pune?" }));
    const inbox = async () => (await repository.listInboxContacts(WORKSPACE_ID, { limit: 10, sort: "newest", now: new Date().toISOString() })).rows
      .find((row) => row.record.igScopedUserId === sender);
    expect((await inbox())?.lastMessageDirection).toBe("INBOUND");

    const contact = await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, sender);
    const { POST } = await import("@/app/api/inbox/[contactId]/route");
    const response = await POST(new Request("https://app.linkar.test/api/inbox/x", { method: "POST", body: JSON.stringify({ text: "Yes, 2 days" }) }), { params: Promise.resolve({ contactId: contact!.id }) });
    expect(response.status).toBe(201);
    expect(dms().at(-1)).toMatchObject({ recipient: { id: sender }, text: "Yes, 2 days" });
    expect((await inbox())?.lastMessageDirection).toBe("OUTBOUND");

    await withClock(Date.now() + 1_000, () => deliverInstagram(messagePayload({ from: sender, text: "menu" })));
    expect(dms()).toHaveLength(1);
    expect((await inbox())?.lastMessageDirection).toBe("INBOUND");
  });
});

describe("interrupted executions (worker restart)", () => {
  it("settles an execution a dead worker claimed, without ever sending it", async () => {
    const automation = await addAutomation(repository, "Price", keywordReply);
    const sender = person();
    const payload = messagePayload({ from: sender, text: "price", mid: "mid_crash" });
    // A worker claimed this event and died before sending anything.
    await repository.claimExecution({ workspaceId: WORKSPACE_ID, automationId: automation.id, externalEventId: "mid_crash", dedupeKey: `${automation.id}:mid_crash` });
    // The stalled job's retry runs while that claim's lease is still live.
    await deliverInstagram(payload);
    expect(dms()).toHaveLength(0);
    expect((await repository.listAutomationExecutions(WORKSPACE_ID, automation.id, 5))[0].status).toBe("PROCESSING");

    await withClock(Date.now() + 40 * 60_000, () => runSweep("Execution reconciliation"));
    expect((await repository.listAutomationExecutions(WORKSPACE_ID, automation.id, 5))[0]).toMatchObject({
      status: "FAILED",
      reason: INTERRUPTED_BEFORE_SENDING,
    });
    // A late redelivery cannot send it twice.
    for (const job of queuedJobs()) await job.remove();
    await deliverInstagram(payload);
    expect(dms()).toHaveLength(0);
  });

  it("says the reply may have gone out when the ledger shows a send", async () => {
    const automation = await addAutomation(repository, "Price", keywordReply);
    await repository.claimExecution({ workspaceId: WORKSPACE_ID, automationId: automation.id, externalEventId: "mid_sent", dedupeKey: `${automation.id}:mid_sent` });
    await repository.ensureOutboundDelivery({
      deliveryKey: `automation:${automation.id}:event:mid_sent:action:0`,
      workspaceId: WORKSPACE_ID,
      automationId: automation.id,
      instagramAccountId: IG_ACCOUNT,
      kind: "CLASSIC_ACTION",
      payload: { type: "send_text", text: "Prices start at 499" },
    });
    await repository.claimOutboundDelivery(`automation:${automation.id}:event:mid_sent:action:0`, "dead_worker", new Date(Date.now() + 30_000).toISOString());
    await withClock(Date.now() + 40 * 60_000, () => runSweep("Execution reconciliation"));
    expect((await repository.listAutomationExecutions(WORKSPACE_ID, automation.id, 5))[0]).toMatchObject({
      status: "FAILED",
      reason: INTERRUPTED_WHILE_SENDING,
    });
  });

  it("leaves a claim that is still within its lease alone", async () => {
    const automation = await addAutomation(repository, "Price", keywordReply);
    await repository.claimExecution({ workspaceId: WORKSPACE_ID, automationId: automation.id, externalEventId: "mid_live", dedupeKey: `${automation.id}:mid_live` });
    await withClock(Date.now() + 10 * 60_000, () => runSweep("Execution reconciliation"));
    expect((await repository.listAutomationExecutions(WORKSPACE_ID, automation.id, 5))[0].status).toBe("PROCESSING");
  });
});
