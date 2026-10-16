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

import { fakeMeta } from "./fakes";
import {
  addAutomation,
  deliverInstagram,
  drain,
  IG_ACCOUNT,
  messagePayload,
  person,
  resetWorld,
  runSweep,
  seedWorkspace,
  WORKSPACE_ID,
} from "./harness";
import type { AutomationRepository } from "../../repository";
import { BROADCAST_OPT_OUT_LINE } from "../broadcast-opt-out";
import type { FlowDefinitionV1 } from "../types";

let repository: AutomationRepository;

beforeEach(async () => {
  repository = await resetWorld();
  await seedWorkspace(repository);
});

const dms = () => fakeMeta.sends().filter((call) => call.kind === "direct_message");
const HOUR = 60 * 60_000;

async function withClock<T>(at: number, run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(at);
    return await run();
  } finally {
    vi.useRealTimers();
  }
}

const capture: FlowDefinitionV1 = {
  version: 1,
  trigger: { type: "message", match: "keyword", keywords: ["guide"] },
  conditions: [],
  actions: [{ type: "send_text", text: "Here's the guide" }],
  emailCapture: { promptText: "Email?", confirmationText: "Thanks!" },
};

async function postBroadcast(segment: "all_contacts" | "captured_email") {
  const { POST } = await import("@/app/api/broadcasts/route");
  const response = await POST(new Request("https://app.linkar.test/api/broadcasts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Diwali", text: "Diwali sale is live!", segment }),
  }));
  return { status: response.status, body: await response.json() };
}

describe("broadcasts", () => {
  it("sends only to eligible contacts inside the 24-hour window, never to opted-out people", async () => {
    await addAutomation(repository, "Capture", capture);
    const lead = person();
    const recent = person();
    const stale = person();
    const optedOut = person();
    await withClock(Date.now() - 2 * 24 * HOUR, () => deliverInstagram(messagePayload({ from: stale, text: "hello" })));
    await deliverInstagram(messagePayload({ from: lead, text: "guide" }));
    await deliverInstagram(messagePayload({ from: lead, text: "lead@example.com" }));
    await deliverInstagram(messagePayload({ from: recent, text: "hi" }));
    await deliverInstagram(messagePayload({ from: optedOut, text: "stop" }));
    const sentBefore = dms().length;

    const created = await postBroadcast("all_contacts");
    expect(created.status).toBe(201);
    expect(created.body.audience).toMatchObject({ eligible: 2, queued: 2 });
    await withClock(Date.now() + HOUR, () => drain());

    const blast = dms().slice(sentBefore);
    expect(blast.map((call) => call.recipient?.id).sort()).toEqual([lead, recent].sort());
    expect(blast.every((call) => call.text === `Diwali sale is live!\n\n${BROADCAST_OPT_OUT_LINE}`)).toBe(true);
    const [broadcast] = await repository.listBroadcasts(WORKSPACE_ID, 5);
    expect(broadcast).toMatchObject({ status: "COMPLETED", sent: 2, total: 2 });
  });

  it("suppresses a person who replies STOP to a broadcast, so the next one skips them", async () => {
    const staying = person();
    const leaving = person();
    await deliverInstagram(messagePayload({ from: staying, text: "hi" }));
    await deliverInstagram(messagePayload({ from: leaving, text: "hello" }));

    expect((await postBroadcast("all_contacts")).body.audience).toMatchObject({ eligible: 2 });
    await withClock(Date.now() + HOUR, () => drain());
    const first = dms().filter((call) => call.recipient?.id === leaving).at(-1);
    expect(first?.text).toContain(BROADCAST_OPT_OUT_LINE);

    await deliverInstagram(messagePayload({ from: leaving, text: "STOP" }));
    expect((await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, leaving))?.suppressedAt).toBeTruthy();
    expect((await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, staying))?.suppressedAt).toBeFalsy();

    const sentBefore = dms().length;
    expect((await postBroadcast("all_contacts")).body.audience).toMatchObject({ eligible: 1 });
    await withClock(Date.now() + 2 * HOUR, () => drain());
    expect(dms().slice(sentBefore).map((call) => call.recipient?.id)).toEqual([staying]);
  });

  it("targets only captured leads for the captured-email segment", async () => {
    await addAutomation(repository, "Capture", capture);
    const lead = person();
    await deliverInstagram(messagePayload({ from: lead, text: "guide" }));
    await deliverInstagram(messagePayload({ from: lead, text: "lead@example.com" }));
    await deliverInstagram(messagePayload({ from: person(), text: "hi" }));
    const sentBefore = dms().length;
    const created = await postBroadcast("captured_email");
    expect(created.body.audience).toMatchObject({ eligible: 1 });
    await withClock(Date.now() + HOUR, () => drain());
    expect(dms().slice(sentBefore).map((call) => call.recipient?.id)).toEqual([lead]);
  });

  it("skips a recipient who opted out after the blast was queued", async () => {
    const recipient = person();
    await deliverInstagram(messagePayload({ from: recipient, text: "hi" }));
    await postBroadcast("all_contacts");
    await repository.suppressContact(WORKSPACE_ID, IG_ACCOUNT, recipient, new Date().toISOString());
    await withClock(Date.now() + HOUR, () => drain());
    expect(dms()).toHaveLength(0);
    const [broadcast] = await repository.listBroadcasts(WORKSPACE_ID, 5);
    expect(broadcast).toMatchObject({ status: "COMPLETED", skipped: 1, sent: 0 });
  });
});

describe("sequences", () => {
  async function enrolledLead() {
    const source = await addAutomation(repository, "Capture", capture);
    await repository.createSequence(WORKSPACE_ID, {
      name: "Welcome series",
      status: "ACTIVE",
      sourceAutomationId: source.id,
      steps: [
        { id: "s1", delayHours: 0, text: "Welcome to the list" },
        { id: "s2", delayHours: 2, text: "Here's a tip" },
      ],
    });
    const lead = person();
    await deliverInstagram(messagePayload({ from: lead, text: "guide" }));
    await deliverInstagram(messagePayload({ from: lead, text: "lead@example.com" }));
    return lead;
  }

  it("enrolls a captured lead and sends each timed step from the worker's sweep", async () => {
    const lead = await enrolledLead();
    await runSweep("Sequence sweep");
    expect(dms().at(-1)).toMatchObject({ recipient: { id: lead }, text: "Welcome to the list" });

    await runSweep("Sequence sweep");
    expect(dms().filter((call) => call.text === "Here's a tip")).toHaveLength(0);
    await withClock(Date.now() + 2 * HOUR + 60_000, () => runSweep("Sequence sweep"));
    expect(dms().at(-1)).toMatchObject({ recipient: { id: lead }, text: "Here's a tip" });
    await withClock(Date.now() + 5 * HOUR, () => runSweep("Sequence sweep"));
    expect(dms().filter((call) => call.text === "Here's a tip")).toHaveLength(1);
  });

  it("stops the sequence when the lead opts out", async () => {
    const lead = await enrolledLead();
    await runSweep("Sequence sweep");
    await deliverInstagram(messagePayload({ from: lead, text: "STOP" }));
    await withClock(Date.now() + 3 * HOUR, () => runSweep("Sequence sweep"));
    expect(dms().some((call) => call.text === "Here's a tip")).toBe(false);
  });

  it("holds a due step during quiet hours and sends it after", async () => {
    await enrolledLead();
    const hour = new Date().getUTCHours();
    await repository.setMessagingWindow(WORKSPACE_ID, { startHour: hour, endHour: (hour + 1) % 24, timezone: "UTC" });
    await runSweep("Sequence sweep");
    expect(dms().some((call) => call.text === "Welcome to the list")).toBe(false);
    await withClock(Date.now() + 61 * 60_000, () => runSweep("Sequence sweep"));
    expect(dms().some((call) => call.text === "Welcome to the list")).toBe(true);
  });

  it("cancels instead of messaging once the 24-hour window has closed", async () => {
    await enrolledLead();
    await runSweep("Sequence sweep");
    await withClock(Date.now() + 25 * HOUR, () => runSweep("Sequence sweep"));
    expect(dms().some((call) => call.text === "Here's a tip")).toBe(false);
  });
});
