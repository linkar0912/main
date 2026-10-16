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
  commentPayload,
  deliverInstagram,
  drain,
  IG_ACCOUNT,
  person,
  postInstagramWebhook,
  queuedJobs,
  resetWorld,
  seedWorkspace,
  WORKSPACE_ID,
} from "./harness";
import type { AutomationRepository } from "../../repository";
import type { FlowDefinitionV1 } from "../types";

let repository: AutomationRepository;

beforeEach(async () => {
  repository = await resetWorld();
  await seedWorkspace(repository);
});

function commentFlow(trigger: Partial<Extract<FlowDefinitionV1["trigger"], { type: "comment" }>>, text = "Here you go"): FlowDefinitionV1 {
  return {
    version: 1,
    trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [], ...trigger },
    conditions: [],
    actions: [{ type: "private_reply", text }],
  };
}

async function executions(automationId: string) {
  return repository.listAutomationExecutions(WORKSPACE_ID, automationId, 100);
}

describe("Instagram comment -> private reply", () => {
  it("answers a keyword comment with one private reply to that comment, personalised", async () => {
    const automation = await addAutomation(repository, "Guide", commentFlow({}, "Here you go, {username} - {keyword}"));
    const commenter = person();
    await deliverInstagram(commentPayload({ from: commenter, username: "asha", text: "GUIDE please", commentId: "c_1" }));

    expect(fakeMeta.sends()).toHaveLength(1);
    expect(fakeMeta.sends()[0]).toMatchObject({
      kind: "private_reply",
      method: "POST",
      path: `/v25.0/${IG_ACCOUNT}/messages`,
      recipient: { comment_id: "c_1" },
      text: "Here you go, asha - guide",
    });
    expect(await repository.listOutboundDeliveriesForRecipient(WORKSPACE_ID, IG_ACCOUNT, commenter, 10))
      .toEqual([expect.objectContaining({ state: "SENT", kind: "CLASSIC_ACTION", providerMessageId: "mid_1" })]);
    expect(await executions(automation.id)).toEqual([expect.objectContaining({ status: "SENT", providerMessageId: "mid_1" })]);
  });

  it.each([
    ["case", "Guide", "GUIDE"],
    ["punctuation", "guide", "guide!!!"],
    ["surrounding words", "guide", "can I get the guide pls"],
    ["accents", "cafe", "Café?"],
    ["emoji keyword", "🔥", "this is 🔥🔥"],
    ["second of several keywords", "pdf", "PDF?"],
  ])("matches keywords regardless of %s", async (_label, keyword, text) => {
    await addAutomation(repository, "Keyword", commentFlow({ keywords: ["link", keyword] }));
    await deliverInstagram(commentPayload({ from: person(), text }));
    expect(fakeMeta.sends()).toHaveLength(1);
  });

  it.each([
    ["all", ["price", "delivery"], "price and delivery?", "price?"],
    ["exact", ["guide"], " Guide ", "guide please"],
    ["contains", ["link"], "linkedin?", "nope"],
    ["regex", ["^size\\s*\\d+$"], "Size 42", "size?"],
  ] as const)("honours the %s match mode", async (mode, keywords, hit, miss) => {
    await addAutomation(repository, `Mode ${mode}`, commentFlow({ keywords: [...keywords], mode }));
    await deliverInstagram(commentPayload({ from: person(), text: miss }));
    expect(fakeMeta.sends()).toHaveLength(0);
    await deliverInstagram(commentPayload({ from: person(), text: hit }));
    expect(fakeMeta.sends()).toHaveLength(1);
  });

  it("drops a matching comment that also has a negative keyword", async () => {
    await addAutomation(repository, "Negative", commentFlow({ negativeKeywords: ["scam"] }));
    await deliverInstagram(commentPayload({ from: person(), text: "guide? or scam" }));
    expect(fakeMeta.sends()).toHaveLength(0);
  });

  it("fills {media} and leaves unknown tokens untouched", async () => {
    await addAutomation(repository, "Tokens", commentFlow({}, "Thanks for commenting on {media} {unknown}"));
    await deliverInstagram(commentPayload({ from: person(), text: "guide" }));
    expect(fakeMeta.sends()[0].text).toBe("Thanks for commenting on your post {unknown}");
  });

  it("does not fire on a word that only contains the keyword", async () => {
    await addAutomation(repository, "Keyword", commentFlow({ keywords: ["link"] }));
    await deliverInstagram(commentPayload({ from: person(), text: "linkedin profile?" }));
    expect(fakeMeta.sends()).toHaveLength(0);
  });

  it("replies to any comment on a catch-all flow, including emoji-only comments", async () => {
    await addAutomation(repository, "Anything", commentFlow({ match: "any", keywords: [] }, "Thanks!"));
    await deliverInstagram(commentPayload({ from: person(), text: "😍😍" }));
    await deliverInstagram(commentPayload({ from: person(), text: "nice" }));
    expect(fakeMeta.sends().map((call) => call.text)).toEqual(["Thanks!", "Thanks!"]);
  });

  it("only answers comments on the selected posts", async () => {
    await addAutomation(repository, "One post", commentFlow({ mediaIds: ["media_launch"] }));
    await deliverInstagram(commentPayload({ from: person(), text: "guide", mediaId: "media_other" }));
    expect(fakeMeta.sends()).toHaveLength(0);
    await deliverInstagram(commentPayload({ from: person(), text: "guide", mediaId: "media_launch" }));
    expect(fakeMeta.sends()).toHaveLength(1);
  });

  it("ignores the connected account's own comments and replies", async () => {
    await addAutomation(repository, "Anything", commentFlow({ match: "any", keywords: [] }));
    const response = await postInstagramWebhook(commentPayload({ from: IG_ACCOUNT, text: "guide", parentId: "c_parent" }));
    expect(await response.json()).toMatchObject({ events: 0 });
    await drain();
    expect(fakeMeta.calls).toHaveLength(0);
  });

  it("sends one reply when Meta delivers the same comment webhook twice", async () => {
    const automation = await addAutomation(repository, "Guide", commentFlow({}));
    const payload = commentPayload({ from: person(), text: "guide", commentId: "c_dup" });
    await deliverInstagram(payload);
    await deliverInstagram(payload);
    // Even when the queue no longer remembers the first job, the execution
    // claim and outbound ledger keep the reply single.
    for (const job of queuedJobs()) await job.remove();
    await deliverInstagram(payload);
    expect(fakeMeta.sends()).toHaveLength(1);
    expect(await executions(automation.id)).toHaveLength(1);
  });

  it("rotates reply variations across commenters", async () => {
    await addAutomation(repository, "Variants", {
      ...commentFlow({ match: "any", keywords: [] }),
      actions: [{ type: "private_reply", text: "Variant A", textVariants: ["Variant B"] }],
    });
    for (let index = 0; index < 24; index += 1) {
      await deliverInstagram(commentPayload({ from: person(), text: "hi" }));
    }
    const texts = new Set(fakeMeta.sends().map((call) => call.text));
    expect(texts).toEqual(new Set(["Variant A", "Variant B"]));
  });

  it("lets only the highest-priority matching automation reply (Meta allows one private reply per comment)", async () => {
    const low = await addAutomation(repository, "Low", commentFlow({}, "low"), { priority: 0 });
    const high = await addAutomation(repository, "High", commentFlow({}, "high"), { priority: 5 });
    await deliverInstagram(commentPayload({ from: person(), text: "guide" }));
    expect(fakeMeta.sends().map((call) => call.text)).toEqual(["high"]);
    expect(await executions(high.id)).toEqual([expect.objectContaining({ status: "SENT" })]);
    expect(await executions(low.id)).toEqual([expect.objectContaining({ status: "SKIPPED" })]);
  });

  it("replies once per person when reply-once is on", async () => {
    await addAutomation(repository, "Once", commentFlow({ replyOncePerUser: true }));
    const commenter = person();
    await deliverInstagram(commentPayload({ from: commenter, text: "guide" }));
    await deliverInstagram(commentPayload({ from: commenter, text: "guide again" }));
    expect(fakeMeta.sends()).toHaveLength(1);
  });

  it("refuses to private-reply to a comment older than Meta's 7-day window", async () => {
    const automation = await addAutomation(repository, "Guide", commentFlow({}));
    await deliverInstagram(commentPayload({ from: person(), text: "guide", at: Date.now() - 8 * 24 * 60 * 60 * 1_000 }));
    expect(fakeMeta.sends()).toHaveLength(0);
    const [execution] = await executions(automation.id);
    expect(execution).toMatchObject({ status: "FAILED" });
    expect(execution.reason).toMatch(/7 days/i);
  });

  it("skips comments outside the automation's schedule", async () => {
    await addAutomation(repository, "Scheduled", {
      ...commentFlow({}),
      schedule: { startsAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    await deliverInstagram(commentPayload({ from: person(), text: "guide" }));
    expect(fakeMeta.sends()).toHaveLength(0);
  });

  it("does not answer comments for a paused automation or a disconnected account", async () => {
    const automation = await addAutomation(repository, "Guide", commentFlow({}));
    await repository.updateAutomation(WORKSPACE_ID, automation.id, { status: "PAUSED" });
    await deliverInstagram(commentPayload({ from: person(), text: "guide" }));
    expect(fakeMeta.sends()).toHaveLength(0);
  });
});
