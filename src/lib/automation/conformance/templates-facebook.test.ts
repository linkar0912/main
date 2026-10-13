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
  facebookCommentPayload,
  IG_ACCOUNT,
  messagePayload,
  optinPayload,
  PAGE_ID,
  person,
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
import type { FlowDefinitionV1 } from "../types";
import { basicAutomationTemplates, type PremadeTemplate } from "../templates";
import { checkDefinitionForTarget } from "../activation-readiness";

let repository: AutomationRepository;

beforeEach(async () => {
  repository = await resetWorld();
  await seedWorkspace(repository);
  await seedFacebookPage(repository);
});

/** The webhook a real person would cause for this trigger. */
function triggeringPayload(template: PremadeTemplate, from: string) {
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
  it.each(basicAutomationTemplates.map((template) => [template.id, template] as const))(
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
