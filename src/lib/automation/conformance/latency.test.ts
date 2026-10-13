import { beforeEach, describe, expect, it, vi } from "vitest";

// --- conformance preamble: only Meta, Redis and BullMQ are faked -----------
vi.mock("server-only", () => ({}));
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
  const { ENTITLEMENT_ROUND_TRIPS, network } = await import("./latency");
  return {
    ...actual,
    // The plan lookup pays the same round trips the Prisma entitlement read does.
    createMemoryEntitlementRepository: (seed?: Parameters<typeof actual.createMemoryEntitlementRepository>[0]) => {
      const inner = actual.createMemoryEntitlementRepository(seed);
      return {
        ...inner,
        async getWorkspaceEntitlement(workspaceId: string) {
          await network.travel("getWorkspaceEntitlement", ENTITLEMENT_ROUND_TRIPS);
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

import { appendFileSync } from "node:fs";
import { fakeMeta, type MetaCallKind } from "./fakes";
import {
  addAutomation,
  commentPayload,
  deliverInstagram,
  messagePayload,
  person,
  postbackPayload,
  resetWorld,
  seedWorkspace,
  setMonthlyDeliveryLimit,
} from "./harness";
import { network, withRoundTrips } from "./latency";
import type { AutomationRepository } from "../../repository";
import type { FlowDefinitionV1, FlowDefinitionV2 } from "../types";

/**
 * Regression guard for reply latency: how many database round trips a person
 * waits through, one after another, between Meta's webhook and our first send
 * - plus Graph lookups made before replying. Production pays ~150-250 ms per
 * round trip (worker in Germany, database in Singapore), so each extra serial
 * round trip here is a visibly slower reply. Loosen a bound only with a
 * measured reason.
 */
const SEND_KINDS = new Set<MetaCallKind>(["private_reply", "direct_message", "public_reply"]);

type Measurement = {
  /** Serial database round trips before Meta was asked to send, per send kind (first occurrence). */
  firstSend: Partial<Record<MetaCallKind, number>>;
  /** Graph calls (lookups, not sends) made before the first send. */
  metaCallsBeforeReply: number;
  databaseCalls: number;
  /** Round trips until the whole job finished. */
  totalRoundTrips: number;
};

let repository: AutomationRepository;

beforeEach(async () => {
  const base = await resetWorld();
  await seedWorkspace(base);
  repository = withRoundTrips(base);
  (globalThis as { linkarRepository?: AutomationRepository }).linkarRepository = repository;
  network.reset();
  const metaFetch = fakeMeta.fetch;
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const index = fakeMeta.calls.length;
    const response = metaFetch(input, init); // records the call synchronously
    await network.travel(`meta:${fakeMeta.calls[index]?.kind ?? "unknown"}`, 0);
    return response;
  });
});

async function measure(payload: unknown): Promise<Measurement> {
  // A cold plan cache, as after any 30-second lull: the steady state worth guarding.
  await setMonthlyDeliveryLimit(null);
  network.reset();
  const report = await network.run(() => deliverInstagram(payload));
  expect(report.failed).toEqual([]);
  const firstSend: Partial<Record<MetaCallKind, number>> = {};
  let firstSendAt: number | undefined;
  let metaCallsBeforeReply = 0;
  for (const call of network.calls) {
    if (!call.name.startsWith("meta:")) continue;
    const kind = call.name.slice("meta:".length) as MetaCallKind;
    if (SEND_KINDS.has(kind)) {
      firstSend[kind] ??= call.startedAt;
      firstSendAt ??= call.startedAt;
    } else if (firstSendAt === undefined) {
      metaCallsBeforeReply += 1;
    }
  }
  const measurement = {
    firstSend,
    metaCallsBeforeReply,
    databaseCalls: network.databaseCalls().length,
    totalRoundTrips: network.now,
  };
  // LINKAR_LATENCY_REPORT=<file> appends each measurement as a JSON line.
  if (process.env.LINKAR_LATENCY_REPORT) {
    appendFileSync(process.env.LINKAR_LATENCY_REPORT, `${JSON.stringify({ scenario: expect.getState().currentTestName, ...measurement })}\n`);
  }
  return measurement;
}

const MEDIA = {
  id: "media_latency",
  mediaType: "VIDEO" as const,
  mediaProductType: "REELS" as const,
  permalink: "https://www.instagram.com/reel/latency/",
  timestamp: "2026-10-01T09:00:00.000Z",
};

function campaign(): FlowDefinitionV2 {
  return {
    version: 2,
    trigger: { type: "comment", source: "specific_media", mediaIds: [MEDIA.id], mediaSnapshots: [MEDIA], match: "keyword", keywords: ["link"] },
    publicReplies: ["Sent you a DM!"],
    openingMessage: { text: "Want the {keyword}? Tap below.", optInButtonLabel: "Send me the link" },
    followGate: { required: true, notFollowingMessage: "Follow us first, then tap below.", recheckButtonLabel: "I followed" },
    delivery: { text: "Here it is!", url: "https://shop.example.com/launch", buttonLabel: "Open link" },
  };
}

describe("reply latency budget (serial database round trips before the first Meta send)", () => {
  it("comment -> classic private reply: 3 round trips, no Graph lookups first", async () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Here you go" }],
    };
    await addAutomation(repository, "Guide", flow);
    // The worker has seen this account before (any earlier event).
    await deliverInstagram(commentPayload({ from: person(), text: "guide" }));

    const result = await measure(commentPayload({ from: person(), text: "guide please" }));

    // Was 14 (workspace lookup, then gatekeeping reads, participant lookup,
    // claim, ledger read, a 7-statement ledger claim + usage reservation).
    expect(result.firstSend.private_reply).toBeLessThanOrEqual(3);
    expect(result.metaCallsBeforeReply).toBe(0);
    expect(result.databaseCalls).toBeLessThanOrEqual(13);
    expect(result.totalRoundTrips).toBeLessThanOrEqual(7);
  });

  it("DM keyword -> reply: 3 round trips", async () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["price"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Prices start at 499" }],
    };
    await addAutomation(repository, "Price", flow);
    await deliverInstagram(messagePayload({ from: person(), text: "price" }));

    const result = await measure(messagePayload({ from: person(), text: "what's the price?" }));

    // Was 14.
    expect(result.firstSend.direct_message).toBeLessThanOrEqual(3);
    expect(result.metaCallsBeforeReply).toBe(0);
    expect(result.databaseCalls).toBeLessThanOrEqual(13);
    expect(result.totalRoundTrips).toBeLessThanOrEqual(7);
  });

  it("comment -> campaign public reply and opening DM: 4 round trips each, sent side by side", async () => {
    await addAutomation(repository, "Launch", campaign());
    await deliverInstagram(commentPayload({ from: person(), text: "link", mediaId: MEDIA.id }));

    const result = await measure(commentPayload({ from: person(), text: "link please", mediaId: MEDIA.id }));

    // Was 20 for both.
    expect(result.firstSend.public_reply).toBeLessThanOrEqual(4);
    expect(result.firstSend.private_reply).toBeLessThanOrEqual(4);
    expect(result.metaCallsBeforeReply).toBe(0);
    expect(result.databaseCalls).toBeLessThanOrEqual(22);
    expect(result.totalRoundTrips).toBeLessThanOrEqual(12);
  });

  it("campaign opt-in tap -> follower check -> link DM", async () => {
    await addAutomation(repository, "Launch", campaign());
    const commenter = person();
    fakeMeta.follows.set(commenter, true);
    await deliverInstagram(commentPayload({ from: commenter, text: "link", mediaId: MEDIA.id }));
    const opening = [...fakeMeta.calls].reverse().find((call) => call.kind === "private_reply");
    const payload = opening?.buttons?.find((button) => button.type === "postback")?.payload;
    expect(typeof payload).toBe("string");

    const result = await measure(postbackPayload({ from: commenter, payload: payload as string }));

    // Was 29. Two participant transitions (OPTED_IN, FOLLOW_VERIFIED) are
    // most of what is left.
    expect(result.firstSend.direct_message).toBeLessThanOrEqual(11);
    // The follower check is the one Graph read this step needs before replying.
    expect(result.metaCallsBeforeReply).toBe(1);
    expect(result.databaseCalls).toBeLessThanOrEqual(19);
  });
});
