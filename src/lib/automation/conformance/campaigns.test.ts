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

import { envOverrides, fakeMeta, type MetaCall } from "./fakes";
import {
  addAutomation,
  commentPayload,
  deliverInstagram,
  drain,
  IG_ACCOUNT,
  IG_USERNAME,
  person,
  postbackPayload,
  postInstagramWebhook,
  resetWorld,
  seedWorkspace,
  setMonthlyDeliveryLimit,
  WORKSPACE_ID,
} from "./harness";
import { recordAccountThrottle, resetAccountPauseStateForTests } from "../account-pause";
import type { AutomationRecord, AutomationRepository } from "../../repository";
import type { FlowDefinitionV2 } from "../types";

let repository: AutomationRepository;

beforeEach(async () => {
  repository = await resetWorld();
  await seedWorkspace(repository);
});

const MEDIA = {
  id: "media_launch",
  mediaType: "VIDEO" as const,
  mediaProductType: "REELS" as const,
  permalink: "https://www.instagram.com/reel/launch/",
  timestamp: "2026-10-01T09:00:00.000Z",
};

function campaign(overrides: Partial<FlowDefinitionV2> = {}): FlowDefinitionV2 {
  return {
    version: 2,
    trigger: {
      type: "comment",
      source: "specific_media",
      mediaIds: [MEDIA.id],
      mediaSnapshots: [MEDIA],
      match: "keyword",
      keywords: ["link"],
    },
    publicReplies: ["Sent you a DM!", "Check your inbox!"],
    openingMessage: { text: "Want the {keyword}? Tap below.", optInButtonLabel: "Send me the link" },
    followGate: { required: true, notFollowingMessage: "Follow us first, then tap below.", recheckButtonLabel: "I followed" },
    delivery: { text: "Here it is!", url: "https://shop.example.com/launch", buttonLabel: "Open link" },
    ...overrides,
  };
}

function lastPostbackPayload(kind: MetaCall["kind"]): string {
  const call = [...fakeMeta.calls].reverse().find((candidate) => candidate.kind === kind && candidate.buttons);
  const button = call?.buttons?.find((candidate) => candidate.type === "postback");
  if (!button || typeof button.payload !== "string") throw new Error(`no postback button on the last ${kind}`);
  return button.payload;
}

async function participantFor(automation: AutomationRecord) {
  const [participant] = await repository.listParticipants(WORKSPACE_ID, automation.id, 10);
  return participant;
}

describe("comment-to-link campaign (v2)", () => {
  it("posts a public reply and a private opening DM with an opt-in button", async () => {
    const automation = await addAutomation(repository, "Launch", campaign());
    const commenter = person();
    await deliverInstagram(commentPayload({ from: commenter, text: "LINK please", mediaId: MEDIA.id, commentId: "c_launch" }));

    const publicReply = fakeMeta.calls.find((call) => call.kind === "public_reply");
    expect(publicReply).toMatchObject({ method: "POST", path: "/v25.0/c_launch/replies" });
    expect(["Sent you a DM!", "Check your inbox!"]).toContain(publicReply?.body?.message);

    const opening = fakeMeta.calls.find((call) => call.kind === "private_reply");
    expect(opening).toMatchObject({
      recipient: { comment_id: "c_launch" },
      text: "Want the link? Tap below.",
      attachmentType: "template",
    });
    expect(opening?.buttons).toEqual([expect.objectContaining({ type: "postback", title: "Send me the link" })]);

    expect(await participantFor(automation)).toMatchObject({
      state: "OPENING_SENT",
      publicReplyStatus: "SENT",
      openingStatus: "SENT",
      igScopedUserId: commenter,
      matchedKeyword: "link",
    });
  });

  it("rotates public replies across commenters", async () => {
    await addAutomation(repository, "Launch", campaign());
    for (let index = 0; index < 16; index += 1) {
      await deliverInstagram(commentPayload({ from: person(), text: "link", mediaId: MEDIA.id }));
    }
    const replies = new Set(fakeMeta.calls.filter((call) => call.kind === "public_reply").map((call) => call.body?.message));
    expect(replies).toEqual(new Set(["Sent you a DM!", "Check your inbox!"]));
  });

  it("delivers a tracked link straight away to a follower who taps the button, and counts the click", async () => {
    const automation = await addAutomation(repository, "Launch", campaign());
    const commenter = person();
    fakeMeta.follows.set(commenter, true);
    await deliverInstagram(commentPayload({ from: commenter, text: "link", mediaId: MEDIA.id }));
    await deliverInstagram(postbackPayload({ from: commenter, payload: lastPostbackPayload("private_reply") }));

    expect(fakeMeta.calls.filter((call) => call.kind === "follow_check")).toHaveLength(1);
    const participant = await participantFor(automation);
    const delivery = fakeMeta.calls.filter((call) => call.kind === "direct_message").at(-1);
    expect(delivery).toMatchObject({ recipient: { id: commenter }, text: "Here it is!" });
    expect(delivery?.buttons).toEqual([{ type: "web_url", url: `https://app.linkar.test/api/t/${participant.id}`, title: "Open link" }]);
    expect(participant).toMatchObject({ state: "LINK_SENT", followStatus: true, finalDeliveryStatus: "SENT" });

    // The tracked link counts the first tap and forwards to the real URL.
    const { GET } = await import("@/app/api/t/[id]/route");
    const response = await GET(new Request(`https://app.linkar.test/api/t/${participant.id}`), { params: Promise.resolve({ id: participant.id }) });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://shop.example.com/launch");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await participantFor(automation)).deliveryClickedAt).toBeTruthy();
    expect((await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, commenter))?.tags).toContain("clicked");
  });

  it("asks a non-follower to follow, then re-checks and delivers after they tap 'I followed'", async () => {
    const automation = await addAutomation(repository, "Launch", campaign());
    const commenter = person();
    await deliverInstagram(commentPayload({ from: commenter, text: "link", mediaId: MEDIA.id }));
    await deliverInstagram(postbackPayload({ from: commenter, payload: lastPostbackPayload("private_reply") }));

    const prompt = fakeMeta.calls.filter((call) => call.kind === "direct_message").at(-1);
    expect(prompt).toMatchObject({ recipient: { id: commenter }, text: "Follow us first, then tap below." });
    expect(prompt?.buttons).toEqual([
      { type: "web_url", title: "Visit Profile", url: `https://www.instagram.com/${IG_USERNAME}/` },
      expect.objectContaining({ type: "postback", title: "I followed" }),
    ]);
    expect(await participantFor(automation)).toMatchObject({ state: "FOLLOW_REQUIRED", followStatus: false });

    fakeMeta.follows.set(commenter, true);
    await deliverInstagram(postbackPayload({ from: commenter, payload: lastPostbackPayload("direct_message"), at: Date.now() + 15_000 }));
    expect(await participantFor(automation)).toMatchObject({ state: "LINK_SENT", followStatus: true });
    expect(fakeMeta.calls.filter((call) => call.kind === "follow_check")).toHaveLength(2);
  });

  it("keeps asking (without delivering) while the person still does not follow", async () => {
    const automation = await addAutomation(repository, "Launch", campaign());
    const commenter = person();
    await deliverInstagram(commentPayload({ from: commenter, text: "link", mediaId: MEDIA.id }));
    await deliverInstagram(postbackPayload({ from: commenter, payload: lastPostbackPayload("private_reply") }));
    await deliverInstagram(postbackPayload({ from: commenter, payload: lastPostbackPayload("direct_message"), at: Date.now() + 15_000 }));
    expect(await participantFor(automation)).toMatchObject({ state: "FOLLOW_REQUIRED" });
    expect(fakeMeta.calls.filter((call) => call.kind === "direct_message" && call.text === "Here it is!")).toHaveLength(0);
  });

  it("delivers right after the tap when the follow gate is off", async () => {
    const automation = await addAutomation(repository, "Ungated", campaign({
      followGate: { required: false, notFollowingMessage: "", recheckButtonLabel: "" },
    }));
    const commenter = person();
    await deliverInstagram(commentPayload({ from: commenter, text: "link", mediaId: MEDIA.id }));
    await deliverInstagram(postbackPayload({ from: commenter, payload: lastPostbackPayload("private_reply") }));
    expect(fakeMeta.calls.filter((call) => call.kind === "follow_check")).toHaveLength(0);
    expect(await participantFor(automation)).toMatchObject({ state: "LINK_SENT" });
  });

  it("ignores a forged button payload and one tapped by someone else", async () => {
    await addAutomation(repository, "Launch", campaign());
    const commenter = person();
    await deliverInstagram(commentPayload({ from: commenter, text: "link", mediaId: MEDIA.id }));
    const payload = lastPostbackPayload("private_reply");
    const sendsBefore = fakeMeta.sends().length;
    await deliverInstagram(postbackPayload({ from: commenter, payload: `${payload.slice(0, -2)}xx` }));
    await deliverInstagram(postbackPayload({ from: person(), payload }));
    expect(fakeMeta.sends()).toHaveLength(sendsBefore);
  });

  it("does not run for comments on other posts or without the keyword", async () => {
    await addAutomation(repository, "Launch", campaign());
    await deliverInstagram(commentPayload({ from: person(), text: "link", mediaId: "media_other" }));
    await deliverInstagram(commentPayload({ from: person(), text: "nice reel", mediaId: MEDIA.id }));
    expect(fakeMeta.calls).toHaveLength(0);
  });

  it("binds a 'next post' campaign to the first post published after activation", async () => {
    const automation = await addAutomation(repository, "Next post", campaign({
      trigger: { type: "comment", source: "next_media", mediaIds: [], mediaSnapshots: [], match: "any", keywords: [] },
    }), { activatedAt: new Date(Date.now() - 60 * 60_000).toISOString() });
    fakeMeta.media.set("media_old", { id: "media_old", media_type: "IMAGE", permalink: "https://www.instagram.com/p/old/", timestamp: new Date(Date.now() - 2 * 60 * 60_000).toISOString() });
    fakeMeta.media.set("media_new", { id: "media_new", media_type: "IMAGE", permalink: "https://www.instagram.com/p/new/", timestamp: new Date(Date.now() - 10 * 60_000).toISOString() });

    await deliverInstagram(commentPayload({ from: person(), text: "hi", mediaId: "media_old" }));
    expect(fakeMeta.sends()).toHaveLength(0);
    await deliverInstagram(commentPayload({ from: person(), text: "hi", mediaId: "media_new" }));
    expect(fakeMeta.calls.filter((call) => call.kind === "private_reply")).toHaveLength(1);
    expect((await repository.getAutomation(WORKSPACE_ID, automation.id))?.boundMediaId).toBe("media_new");
  });

  it("handles a redelivered comment webhook once", async () => {
    await addAutomation(repository, "Launch", campaign());
    const payload = commentPayload({ from: person(), text: "link", mediaId: MEDIA.id });
    await deliverInstagram(payload);
    await deliverInstagram(payload);
    expect(fakeMeta.calls.filter((call) => call.kind === "private_reply")).toHaveLength(1);
    expect(fakeMeta.calls.filter((call) => call.kind === "public_reply")).toHaveLength(1);
  });

  it("records the plan limit - not a Meta failure - when the monthly allowance is used up", async () => {
    await setMonthlyDeliveryLimit(0);
    const automation = await addAutomation(repository, "Launch", campaign());
    await deliverInstagram(commentPayload({ from: person(), text: "link", mediaId: MEDIA.id }));

    expect(fakeMeta.sends()).toHaveLength(0);
    const participant = await participantFor(automation);
    expect(participant.publicReplyError).toBe("Monthly delivery limit reached");
    expect(participant.openingError).toBe("Monthly delivery limit reached");
    const executions = await repository.listAutomationExecutions(WORKSPACE_ID, automation.id, 10);
    expect(executions.map((execution) => execution.reason)).toEqual(["Monthly delivery limit reached", "Monthly delivery limit reached"]);
  });

  it("stores Meta's rejection as a plain-English reason on the participant", async () => {
    const automation = await addAutomation(repository, "Launch", campaign({ publicReplies: [] }));
    fakeMeta.fail((call) => call.kind === "private_reply", {
      status: 400,
      error: { message: "Не удается найти запрошенного пользователя.", code: 100, error_subcode: 2534014 },
    });
    await deliverInstagram(commentPayload({ from: person(), text: "link", mediaId: MEDIA.id }));
    const participant = await participantFor(automation);
    expect(participant).toMatchObject({ state: "FAILED", openingStatus: "FAILED" });
    expect(participant.openingError).toMatch(/^[\x20-\x7E]+$/);
    expect(participant.openingError).toMatch(/couldn't find/i);
  });
});

describe("comment-to-link campaign when Meta limits the account", () => {
  const HOUR = 60 * 60_000;
  const BLOCKED = "(#2022) The business has been blocked from sending messages via the IG Messaging API";

  beforeEach(() => {
    // Pauses live in this process's memory here (the fake Redis has no key commands).
    resetAccountPauseStateForTests();
  });

  async function withClock<T>(at: number, run: () => Promise<T>): Promise<T> {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(at);
      return await run();
    } finally {
      vi.useRealTimers();
    }
  }

  const privateReplies = () => fakeMeta.calls.filter((call) => call.kind === "private_reply");

  it("keeps answering comments through the slow restart after a block, instead of failing them", async () => {
    // 25% of a 4-an-hour DM ceiling: one automatic send an hour while recovering.
    envOverrides.directMessageRateLimitPerHour = 4;
    const automation = await addAutomation(repository, "Launch", campaign({ publicReplies: [] }));
    fakeMeta.fail((call) => call.kind === "private_reply", { status: 400, error: { message: BLOCKED, code: 10 } });
    const start = Date.now();
    await withClock(start, () => deliverInstagram(commentPayload({ from: person(), text: "link", mediaId: MEDIA.id })));
    expect(privateReplies()).toHaveLength(1);

    // During the pause new comments stop at Linkar instead of reaching Meta.
    await withClock(start + HOUR, () => deliverInstagram(commentPayload({ from: person(), text: "link", mediaId: MEDIA.id })));
    expect(privateReplies()).toHaveLength(1);

    // While recovering, more comments than the hour's share all get their DM,
    // hour after hour, and none fails once its job retries would have run out.
    for (const hour of [0, 1, 23]) {
      const at = start + 24 * HOUR + 60_000 + hour * HOUR;
      for (let index = 0; index < 3; index += 1) {
        const report = await withClock(at, () => deliverInstagram(commentPayload({ from: person(), text: "link", mediaId: MEDIA.id })));
        expect(report.failed).toHaveLength(0);
      }
    }
    expect(privateReplies()).toHaveLength(10);
    const participants = await repository.listParticipants(WORKSPACE_ID, automation.id, 20);
    expect(participants.filter((participant) => participant.openingStatus === "SENT")).toHaveLength(9);
    expect(participants.filter((participant) => participant.state === "FAILED")).toHaveLength(2);
  });

  it("holds a comment's DM through a short throttle pause and sends it once, after the pause", async () => {
    const automation = await addAutomation(repository, "Launch", campaign({ publicReplies: [] }));
    const start = Date.now();
    // Three throttles close together pause the whole account for 15 minutes.
    for (let index = 0; index < 3; index += 1) {
      await recordAccountThrottle({ channel: "instagram", accountId: IG_ACCOUNT }, { now: start });
    }
    await withClock(start, () => postInstagramWebhook(commentPayload({ from: person(), text: "link", mediaId: MEDIA.id })));

    // Run the job, then each retry after the shortest wait BullMQ's jittered
    // backoff could pick (half of 1, 2, 4, 8 and 16 minutes).
    let at = start;
    const runs: string[] = [];
    for (const wait of [0, 30_000, 60_000, 120_000, 240_000, 480_000]) {
      at += wait;
      const report = await withClock(at, () => drain({ maxRuns: 1 }));
      runs.push(report.completed.length ? "completed" : report.failed.length ? "failed" : "retrying");
      if (at < start + 15 * 60_000) expect(privateReplies()).toHaveLength(0);
    }
    expect(runs).toEqual(["retrying", "retrying", "retrying", "retrying", "retrying", "completed"]);
    expect(privateReplies()).toHaveLength(1);
    expect(await participantFor(automation)).toMatchObject({ state: "OPENING_SENT", openingStatus: "SENT" });
  });
});
