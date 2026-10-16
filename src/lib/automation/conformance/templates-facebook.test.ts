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
  commentPayload,
  deliverFacebook,
  deliverInstagram,
  drain,
  facebookCommentPayload,
  IG_ACCOUNT,
  messagePayload,
  optinPayload,
  PAGE_ID,
  person,
  postbackPayload,
  postFacebookWebhook,
  queuedJobs,
  referralPayload,
  resetWorld,
  seedFacebookPage,
  seedWorkspace,
  storyMentionPayload,
  WORKSPACE_ID,
} from "./harness";
import type { AutomationRepository } from "../../repository";
import type { FlowDefinitionV1, FlowDefinitionV2 } from "../types";
import { basicAutomationTemplates, type PremadeTemplate } from "../templates";
import { checkDefinitionForTarget } from "../activation-readiness";
import { resetAccountPauseStateForTests } from "../account-pause";
import { deriveAttentionItems } from "../../home-attention";

let repository: AutomationRepository;

beforeEach(async () => {
  repository = await resetWorld();
  await seedWorkspace(repository);
  await seedFacebookPage(repository);
});

type ClassicTemplate = PremadeTemplate & { setup: { name: string; definition: FlowDefinitionV1 } };
type TwoStepTemplate = PremadeTemplate & { setup: { name: string; definition: FlowDefinitionV2 } };
const isClassic = (template: PremadeTemplate): template is ClassicTemplate => template.setup.definition.version === 1;
const isTwoStep = (template: PremadeTemplate): template is TwoStepTemplate => template.setup.definition.version === 2;

/** The webhook a real person would cause for this trigger. */
function triggeringPayload(template: ClassicTemplate, from: string) {
  const trigger = template.setup.definition.trigger;
  const word = "keywords" in trigger && trigger.match === "keyword" ? trigger.keywords[0] : "love this";
  if (template.provider === "FACEBOOK") return facebookCommentPayload({ from, text: word });
  switch (trigger.type) {
    case "comment": return commentPayload({ from, text: word });
    case "message": return messagePayload({ from, text: word });
    case "first_contact": return messagePayload({ from, text: "hi there" });
    case "story_mention": return storyMentionPayload({ from });
    case "story_reply": return messagePayload({ from, text: word, storyId: "story_template" });
    case "referral": return referralPayload({ from });
    case "optin": return optinPayload({ from });
  }
}

/** Every text the template can put in a message, in action order. */
function templateTexts(definition: FlowDefinitionV1): string[] {
  return definition.actions.flatMap((action) => {
    if (action.type === "send_image") return action.caption ? [action.caption] : [];
    return [action.text, ...(action.type === "private_reply" ? action.textVariants ?? [] : [])];
  });
}

describe("template catalogue", () => {
  it("covers every template, classic or two-step", () => {
    expect(basicAutomationTemplates.filter(isClassic).length + basicAutomationTemplates.filter(isTwoStep).length)
      .toBe(basicAutomationTemplates.length);
  });

  it.each(basicAutomationTemplates.filter(isClassic).map((template) => [template.id, template] as const))(
    "%s: passes builder validation and actually runs end to end",
    async (_id, template) => {
      const definition = template.setup.definition;
      const readiness = checkDefinitionForTarget({
        provider: template.provider,
        ...(template.provider === "FACEBOOK" ? { facebookPageId: PAGE_ID } : { instagramAccountId: IG_ACCOUNT }),
        definition,
      });
      expect(readiness).toMatchObject({ ok: true });

      await addAutomation(repository, template.setup.name, readiness.ok ? readiness.definition : definition, template.provider === "FACEBOOK"
        ? { provider: "FACEBOOK", instagramAccountId: undefined, facebookPageId: PAGE_ID }
        : {});
      const sender = person();
      if (template.provider === "FACEBOOK") await deliverFacebook(triggeringPayload(template, sender));
      else await deliverInstagram(triggeringPayload(template, sender));

      const sent = fakeMeta.sends();
      const expectedTexts = templateTexts(definition);
      expect(sent.length).toBeGreaterThanOrEqual(definition.actions.length);
      // Every action's text went out, in order, through the right Meta call.
      const texts = sent.map((call) => call.kind === "facebook_comment_reply" ? call.body?.message : call.text).filter(Boolean);
      expect(expectedTexts.every((text) => texts.includes(text))).toBe(true);
      const expectedKind = template.provider === "FACEBOOK"
        ? "facebook_comment_reply"
        : definition.trigger.type === "comment" ? "private_reply" : "direct_message";
      expect(sent.every((call) => call.kind === expectedKind)).toBe(true);

      // Collection templates finish the conversation they start.
      const capture = definition.emailCapture;
      if (capture) {
        expect(texts).toContain(capture.promptText);
        await deliverInstagram(messagePayload({ from: sender, text: "lead@example.com" }));
        for (const field of capture.fields ?? []) {
          await deliverInstagram(messagePayload({ from: sender, text: field.kind === "phone" ? "+91 98765 43210" : "Asha" }));
        }
        expect(fakeMeta.sends().at(-1)?.text).toBe(capture.confirmationText);
        expect(await repository.getContact(WORKSPACE_ID, IG_ACCOUNT, sender)).toMatchObject({ email: "lead@example.com", state: "CAPTURED" });
      }
      if (definition.followUps?.length) {
        expect(queuedJobs("flow-followup")).toHaveLength(definition.followUps.length);
      }
    },
  );
});

describe("two-step link templates", () => {
  const MEDIA = {
    id: "media_template",
    mediaType: "VIDEO" as const,
    mediaProductType: "REELS" as const,
    permalink: "https://www.instagram.com/reel/template/",
    timestamp: "2026-10-01T09:00:00.000Z",
  };

  it("includes the comment link recipe", () => {
    expect(basicAutomationTemplates.filter(isTwoStep).map((template) => template.id)).toContain("comment-link-dm");
  });

  it.each(basicAutomationTemplates.filter(isTwoStep).map((template) => [template.id, template] as const))(
    "%s: sends a button first and the link only after the tap",
    async (_id, template) => {
      // The builder's first step picks the post; everything else is the prefill as shipped.
      const definition: FlowDefinitionV2 = {
        ...template.setup.definition,
        trigger: { ...template.setup.definition.trigger, mediaIds: [MEDIA.id], mediaSnapshots: [MEDIA] },
      };
      const readiness = checkDefinitionForTarget({ provider: "INSTAGRAM", instagramAccountId: IG_ACCOUNT, definition });
      expect(readiness).toMatchObject({ ok: true });
      await addAutomation(repository, template.setup.name, readiness.ok ? readiness.definition : definition);

      const sender = person();
      const word = definition.trigger.match === "keyword" ? definition.trigger.keywords[0]! : "love this";
      await deliverInstagram(commentPayload({ from: sender, text: word, mediaId: MEDIA.id }));

      // Step one: a private reply with a button and no link, nothing public.
      expect(fakeMeta.calls.some((call) => call.kind === "public_reply")).toBe(false);
      const opening = fakeMeta.calls.find((call) => call.kind === "private_reply");
      expect(opening?.text).toBe(definition.openingMessage.text);
      expect(opening?.buttons).toEqual([
        expect.objectContaining({ type: "postback", title: definition.openingMessage.optInButtonLabel }),
      ]);
      expect(JSON.stringify(opening)).not.toContain(definition.delivery.url);
      expect(fakeMeta.calls.some((call) => call.kind === "direct_message")).toBe(false);

      // Step two: the tap brings the link, behind its own button.
      const tap = opening?.buttons?.find((button) => button.type === "postback")?.payload;
      expect(typeof tap).toBe("string");
      await deliverInstagram(postbackPayload({ from: sender, payload: String(tap) }));
      expect(fakeMeta.calls.some((call) => call.kind === "follow_check")).toBe(false);
      const delivery = fakeMeta.calls.filter((call) => call.kind === "direct_message").at(-1);
      expect(delivery).toMatchObject({ recipient: { id: sender }, text: definition.delivery.text });
      expect(delivery?.buttons).toEqual([
        expect.objectContaining({ type: "web_url", title: definition.delivery.buttonLabel }),
      ]);
    },
  );
});

describe("Facebook Page comments -> public Page reply", () => {
  const pageFlow: FlowDefinitionV1 = {
    version: 1,
    trigger: { type: "comment", match: "keyword", keywords: ["price"], mediaIds: [] },
    conditions: [],
    actions: [{ type: "private_reply", text: "Thanks {username}! Details are in our bio." }],
  };

  it("posts a public reply under the comment on the Page", async () => {
    await addAutomation(repository, "Page reply", pageFlow, { provider: "FACEBOOK", instagramAccountId: undefined, facebookPageId: PAGE_ID });
    await deliverFacebook(facebookCommentPayload({ from: "fb_user_1", name: "Asha", text: "Price?", commentId: "post_c1" }));
    expect(fakeMeta.sends()).toEqual([expect.objectContaining({
      kind: "facebook_comment_reply",
      method: "POST",
      path: "/v25.0/post_c1/comments",
      body: { message: "Thanks Asha! Details are in our bio." },
    })]);
    expect(fakeMeta.sends()[0].query).toMatchObject({ locale: "en_US", appsecret_proof: expect.any(String) });
  });

  it("ignores the Page's own comments and repeated webhook deliveries", async () => {
    await addAutomation(repository, "Page reply", pageFlow, { provider: "FACEBOOK", instagramAccountId: undefined, facebookPageId: PAGE_ID });
    const response = await postFacebookWebhook(facebookCommentPayload({ from: PAGE_ID, fromPage: true, text: "price" }));
    expect(await response.json()).toMatchObject({ events: 0 });
    const payload = facebookCommentPayload({ from: "fb_user_2", text: "price" });
    await deliverFacebook(payload);
    await deliverFacebook(payload);
    expect(fakeMeta.sends()).toHaveLength(1);
  });

  it("records a missing Page permission as a readable reason", async () => {
    const automation = await addAutomation(repository, "Page reply", pageFlow, { provider: "FACEBOOK", instagramAccountId: undefined, facebookPageId: PAGE_ID });
    fakeMeta.fail((call) => call.kind === "facebook_comment_reply", {
      status: 403,
      error: { message: "(#200) Requires pages_read_engagement permission", code: 200 },
    });
    await deliverFacebook(facebookCommentPayload({ from: "fb_user_3", text: "price" }));
    const [execution] = await repository.listAutomationExecutions(WORKSPACE_ID, automation.id, 5);
    expect(execution).toMatchObject({ status: "FAILED", reason: "permission_missing" });
  });
});

describe("Facebook Page replies when Meta limits the Page", () => {
  const pageFlow: FlowDefinitionV1 = {
    version: 1,
    trigger: { type: "comment", match: "keyword", keywords: ["price"], mediaIds: [] },
    conditions: [],
    actions: [{ type: "private_reply", text: "Thanks {username}! Details are in our bio." }],
  };
  const onPage = { provider: "FACEBOOK" as const, instagramAccountId: undefined, facebookPageId: PAGE_ID };

  beforeEach(() => {
    // Pauses live in the fake Redis (cleared by resetWorld) and in this
    // process's memory, which is cleared here.
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

  it("pauses the Page when Facebook blocks a reply, skips later comments, and Home says until when", async () => {
    const automation = await addAutomation(repository, "Page reply", pageFlow, onPage);
    fakeMeta.fail((call) => call.kind === "facebook_comment_reply", {
      status: 400,
      error: { message: "(#368) The action attempted has been deemed abusive or is otherwise disallowed", code: 368 },
    });

    const first = await deliverFacebook(facebookCommentPayload({ from: "fb_user_4", text: "price" }));
    // Not retried: the job finishes on Facebook's first refusal.
    expect(first.failed).toHaveLength(0);
    expect(queuedJobs("facebook-event")[0]).toMatchObject({ state: "completed", attemptsMade: 0 });
    expect(fakeMeta.sends()).toHaveLength(1);

    // The next comment stops at the pause, even in a process that never saw
    // Facebook's answer: the pause is shared through Redis.
    resetAccountPauseStateForTests();
    await deliverFacebook(facebookCommentPayload({ from: "fb_user_5", text: "price" }));
    expect(fakeMeta.sends()).toHaveLength(1);
    const executions = await repository.listAutomationExecutions(WORKSPACE_ID, automation.id, 5);
    expect(executions.map((execution) => `${execution.status}:${execution.reason}`).sort())
      .toEqual(["FAILED:page_limited", "SKIPPED:page_limited"]);

    const { GET: failuresGet } = await import("@/app/api/insights/failures/route");
    const failures = (await (await failuresGet(new Request("https://app.linkar.test/api/insights/failures"))).json()).data;
    const items = deriveAttentionItems({
      connections: [{ kind: "facebook", name: "Studio Kavya", status: "CONNECTED" }],
      automations: [{ id: automation.id, name: automation.name, status: "ACTIVE" }],
      automationsKnown: true,
      failures,
      usage: null,
    });
    expect(items).toEqual([expect.objectContaining({
      key: "account-paused",
      chip: "Limited",
      text: expect.stringMatching(/^Facebook has limited one of your Pages\. Linkar paused its automatic replies until .+\.$/),
    })]);
  });

  it("parks the reply once repeated throttles pause the Page, then posts it once after the cool-down", async () => {
    await addAutomation(repository, "Page reply", pageFlow, onPage);
    fakeMeta.fail((call) => call.kind === "facebook_comment_reply", {
      status: 400,
      error: { message: "Calls to this api have exceeded the rate limit.", code: 4 },
      times: 3,
    });
    const start = Date.now();

    // Three throttled attempts (the harness runs retries straight away) pause
    // the Page, and the fourth attempt is parked instead of calling Facebook.
    const report = await withClock(start, () => deliverFacebook(facebookCommentPayload({ from: "fb_user_6", text: "price" })));
    expect(fakeMeta.sends()).toHaveLength(3);
    expect(report.deferred).toHaveLength(1);
    const [job] = queuedJobs("facebook-event");
    expect(job).toMatchObject({ state: "delayed", attemptsMade: 3 });
    expect(job!.processAt).toBeGreaterThanOrEqual(start + 15 * 60_000);

    const after = await withClock(start + 16 * 60_000 + 1_000, () => drain());
    expect(after.completed).toHaveLength(1);
    expect(fakeMeta.sends()).toHaveLength(4);
  });
});
