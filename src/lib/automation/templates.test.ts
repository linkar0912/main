import { describe, expect, it } from "vitest";
import { validateFlowDefinition } from "./definition";
import { basicAutomationTemplates, getCompatibleTemplates, getTemplateById, type PremadeTemplate } from "./templates";
import type { FlowDefinition, FlowDefinitionV1, FlowDefinitionV2 } from "./types";
import { findPublicUrlShortenerLinks } from "../security/outbound-url";

/** The classic (version 1) prefill of a template, failing loudly if it is not one. */
function classic(template: PremadeTemplate | undefined): FlowDefinitionV1 {
  const definition = template?.setup.definition;
  if (definition?.version !== 1) throw new Error(`${template?.id ?? "template"} is not a classic template`);
  return definition;
}

/** The step-by-step (version 2) prefill of a template, failing loudly if it is not one. */
function twoStep(template: PremadeTemplate | undefined): FlowDefinitionV2 {
  const definition = template?.setup.definition;
  if (definition?.version !== 2) throw new Error(`${template?.id ?? "template"} is not a two-step template`);
  return definition;
}

/** What the builder's first step adds to a two-step prefill: the post to watch. */
function withChosenPost(definition: FlowDefinition): FlowDefinition {
  if (definition.version !== 2 || definition.trigger.source !== "specific_media") return definition;
  return {
    ...definition,
    trigger: {
      ...definition.trigger,
      mediaIds: ["media_1"],
      mediaSnapshots: [{
        id: "media_1",
        mediaType: "VIDEO",
        mediaProductType: "REELS",
        permalink: "https://www.instagram.com/reel/demo/",
        timestamp: "2026-10-01T09:00:00.000Z",
      }],
    },
  };
}

/** Comment recipes that send a button first and the link only after the tap. */
const TWO_STEP_LINK_TEMPLATES = ["comment-link-dm", "lead-magnet-comment"];

describe("premade automation templates", () => {
  it("gives every recipe short, outcome-first copy and natural steps", () => {
    for (const template of basicAutomationTemplates) {
      expect(template.title.trim().length, `${template.id} needs a title`).toBeGreaterThan(0);
      expect(template.description.length, `${template.id} description is too long`).toBeLessThanOrEqual(140);
      expect(template.description, `${template.id} description must be one sentence`).toMatch(/[.!?]$/);
      expect(template.howItWorks.length, `${template.id} needs plain steps`).toBeGreaterThanOrEqual(2);
      expect(template.howItWorks.length).toBeLessThanOrEqual(5);
      expect([template.title, template.description, ...template.howItWorks].join(" ")).not.toMatch(/→|\b(trigger|payload|webhook|opt-in)\b/i);
    }
  });

  it("uses the approved names for the most common recipes", () => {
    expect(getTemplateById("comment-link-dm")?.title).toBe("Send a link when someone comments");
    expect(getTemplateById("default-reply")?.title).toBe("Reply to every new message");
    expect(getTemplateById("story-mention-reply")?.title).toBe("Thank people who mention you in a Story");
  });
  it("ships the complete Facebook Page-comment recipe set with safe public replies", () => {
    const expectedIds = [
      "facebook-keyword-comment-reply",
      "facebook-every-comment-reply",
      "facebook-product-pricing-faq",
      "facebook-availability-hours",
      "facebook-giveaway-acknowledgement",
      "facebook-support-acknowledgement",
      "facebook-per-post-campaign-reply",
    ];
    const templates = getCompatibleTemplates({ provider: "FACEBOOK", surface: "COMMENT", capabilities: ["facebook-page-comment"] });

    expect(templates.map((template) => template.id)).toEqual(expectedIds);
    for (const template of templates) {
      expect(template.provider).toBe("FACEBOOK");
      expect(template.surface).toBe("COMMENT");
      expect(template.requiredCapabilities).toEqual(["facebook-page-comment"]);
      const definition = classic(template);
      expect(definition.trigger.type).toBe("comment");
      expect(definition.actions).toHaveLength(1);
      expect(definition.actions[0].type).toBe("private_reply");
      expect(JSON.stringify(template.setup)).not.toContain("example.com");
    }
  });

  it("does not offer Instagram recipes for a Facebook Page target", () => {
    const facebook = getCompatibleTemplates({ provider: "FACEBOOK", surface: "COMMENT", capabilities: ["facebook-page-comment"] });
    expect(facebook.some((template) => template.id === "comment-catch-all")).toBe(false);

    const instagram = getCompatibleTemplates({ provider: "INSTAGRAM", surface: "MESSAGING", capabilities: ["instagram-messaging"] });
    expect(instagram.length).toBeGreaterThan(0);
    expect(instagram.every((template) => template.provider === "INSTAGRAM" && template.surface === "MESSAGING")).toBe(true);
  });
  it("exposes unique template ids", () => {
    const ids = basicAutomationTemplates.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every template a valid builder prefill", () => {
    for (const template of basicAutomationTemplates) {
      const setup = template.setup;
      expect(setup, `${template.id} needs a setup prefill`).toBeDefined();
      // Two-step templates leave the post to the builder's first step.
      const normalized = validateFlowDefinition(withChosenPost(setup!.definition));
      expect(normalized.version, template.id).toBe(TWO_STEP_LINK_TEMPLATES.includes(template.id) ? 2 : 1);
      if (normalized.version === 1) {
        expect(normalized.actions.length).toBeGreaterThanOrEqual(1);
        // Every action carries something deliverable: copy, or an image URL.
        expect(
          normalized.actions.every((action) =>
            action.type === "send_image" ? action.imageUrl.trim().length > 0 : action.text.trim().length > 0),
        ).toBe(true);
      }
      expect(setup!.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("runs every recipe on an engine capability that exists today", () => {
    // Nothing may ship as BETA/unavailable: each template's trigger must be one the
    // engine can actually fire on, and email collectors must carry full copy.
    for (const template of basicAutomationTemplates) {
      const definition = template.setup!.definition;
      expect(["comment", "message", "referral", "optin", "first_contact", "story_mention", "story_reply"]).toContain(
        definition.trigger.type,
      );
      if (definition.version === 1 && definition.emailCapture) {
        expect(definition.emailCapture.promptText.trim().length).toBeGreaterThan(0);
        expect(definition.emailCapture.confirmationText.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("greets first-time contacts exactly once via the first_contact trigger", () => {
    const welcome = getTemplateById("welcome-new-followers")!;
    expect(welcome.setup!.definition.trigger.type).toBe("first_contact");
  });

  it("replies to story mentions via the story_mention trigger", () => {
    const story = getTemplateById("story-mention-reply")!;
    expect(story.setup!.definition.trigger.type).toBe("story_mention");
  });

  it("sends a link to Story replies via the story_reply trigger", () => {
    const story = getTemplateById("story-reply-link")!;
    expect(story.setup!.definition.trigger).toMatchObject({ type: "story_reply", match: "keyword", keywords: ["link"] });
  });

  it("captures emails with the email-capture template", () => {
    const capture = classic(getTemplateById("email-capture"));
    expect(capture.emailCapture).toBeDefined();
    expect(capture.trigger.type).toBe("message");
    // The recipe fulfills its own promise: a delivery email ships with the capture.
    expect(capture.emailCapture?.delivery?.subject.trim().length).toBeGreaterThan(0);
    expect(capture.emailCapture?.delivery?.linkUrl).toBeDefined();
  });

  it("looks templates up by id", () => {
    expect(getTemplateById("default-reply")?.title).toContain("Reply to every new message");
    expect(getTemplateById("conversation-starters")?.setup).toBeDefined();
    expect(getTemplateById("does-not-exist")).toBeUndefined();
  });

  it("private-replies to comments instead of DMing, since that's the actual Meta action for a comment trigger", () => {
    const catchAll = classic(getTemplateById("comment-catch-all"));
    expect(catchAll.trigger.type).toBe("comment");
    expect(catchAll.actions.every((action) => action.type === "private_reply")).toBe(true);
  });

  it("ships only two-step versions of the comment recipes that send a link", () => {
    const commentLinkRecipes = basicAutomationTemplates.filter((template) =>
      template.provider === "INSTAGRAM" && template.surface === "COMMENT" && template.setup.definition.version === 2);
    expect(commentLinkRecipes.map((template) => template.id).sort()).toEqual([...TWO_STEP_LINK_TEMPLATES].sort());
    // No classic Instagram comment recipe puts a link in its first private reply.
    for (const template of basicAutomationTemplates) {
      const definition = template.setup.definition;
      if (template.provider !== "INSTAGRAM" || definition.version !== 1 || definition.trigger.type !== "comment") continue;
      expect(JSON.stringify(definition.actions), template.id).not.toMatch(/https?:\/\/|example\.com/i);
    }
  });

  it.each(TWO_STEP_LINK_TEMPLATES)("%s: a button first, the link only after the tap", (id) => {
    const template = getTemplateById(id)!;
    const definition = twoStep(template);
    expect(definition.trigger).toMatchObject({ type: "comment", source: "specific_media", match: "keyword" });
    // The opening private reply carries a button and no link at all.
    expect(definition.openingMessage.text).not.toMatch(/https?:\/\/|example\.com/i);
    expect(definition.openingMessage.optInButtonLabel.length).toBeGreaterThan(0);
    expect(definition.openingMessage.optInButtonLabel.length).toBeLessThanOrEqual(20);
    // The link goes out after the tap, behind its own button, with no follow check.
    expect(definition.followGate.required).toBe(false);
    expect(definition.delivery.url).toMatch(/^https:\/\//);
    expect(definition.delivery.buttonLabel).toBeTruthy();
    expect(definition.publicReplies).toEqual([]);
    expect(template.surface).toBe("COMMENT");
    expect(template.requiredCapabilities).toEqual(["instagram-comment"]);
    expect(template.description).toMatch(/button/);
    expect(template.howItWorks).toEqual([
      "Someone comments using a word you choose.",
      "Linkar privately replies with a short message and a button.",
      "When they tap the button, Linkar sends your link.",
    ]);
    // Savable from the builder once a post is chosen, and not before.
    expect(validateFlowDefinition(withChosenPost(definition))).toMatchObject({ version: 2, followGate: { required: false } });
    expect(() => validateFlowDefinition(definition)).toThrow(/at least one media ID/);
  });

  it("asks for the free guide with GUIDE, PDF or FREE and sends the guide link after the tap", () => {
    const definition = twoStep(getTemplateById("lead-magnet-comment"));
    expect(definition.trigger).toMatchObject({ keywords: ["guide", "pdf", "free"] });
    expect(definition.openingMessage.text).toMatch(/free guide/i);
    expect(definition.delivery).toMatchObject({ url: "https://example.com/guide", buttonLabel: "Open the guide" });
  });

  it("sends the comment link in two steps: a button first, the link only after the tap", () => {
    const template = getTemplateById("comment-link-dm")!;
    const definition = twoStep(template);
    expect(definition.trigger).toMatchObject({ type: "comment", match: "keyword", keywords: ["link", "shop"] });
    // The opening private reply carries a button and no link at all.
    expect(definition.openingMessage.text).not.toMatch(/https?:\/\/|example\.com/i);
    expect(definition.openingMessage.optInButtonLabel.length).toBeGreaterThan(0);
    expect(definition.openingMessage.optInButtonLabel.length).toBeLessThanOrEqual(20);
    // The link goes out after the tap, behind its own button, with no follow check.
    expect(definition.followGate.required).toBe(false);
    expect(definition.delivery.url).toMatch(/^https:\/\//);
    expect(definition.delivery.buttonLabel).toBeTruthy();
    // Private only, like the classic recipe it replaces. The builder test
    // walks every step of the real builder to show a save keeps it that way.
    expect(definition.publicReplies).toEqual([]);
    expect(template.surface).toBe("COMMENT");
    expect(template.requiredCapabilities).toEqual(["instagram-comment"]);
    expect(template.howItWorks).toEqual([
      "Someone comments using a word you choose.",
      "Linkar privately replies with a short message and a button.",
      "When they tap the button, Linkar sends your link.",
    ]);
  });

  it("keeps the two-step link recipe savable from the builder once a post is chosen", () => {
    const definition = twoStep(getTemplateById("comment-link-dm"));
    // The builder sends blank follow-gate copy when the gate is off.
    const saved = validateFlowDefinition(withChosenPost(definition));
    expect(saved).toMatchObject({ version: 2, followGate: { required: false } });
    // Without a post the builder's first step stops the save, and so does the server.
    expect(() => validateFlowDefinition(definition)).toThrow(/at least one media ID/);
  });

  it("never ships a public link shortener in a template", () => {
    for (const template of basicAutomationTemplates) {
      expect(findPublicUrlShortenerLinks(template.setup), template.id).toEqual([]);
    }
  });

  it("offers a keyword-free comment recipe, recommended, for “anyone comments anything → they get a reply”", () => {
    const catchAll = getTemplateById("comment-catch-all")!;
    expect(catchAll.setup!.definition.trigger).toMatchObject({ type: "comment", match: "any", keywords: [] });
    // Replying to every comment suits a small post, not a viral one, and the
    // card says so before anyone sets it up.
    expect(catchAll.description).toMatch(/^Meant for smaller posts/);
    // Surfaced under "Recommended" rather than buried in "More templates":
    // replying to every comment is one of the two things people arrive wanting.
    expect(catchAll.popular).toBe(true);
    // The title has to say what it does without the reader opening it.
    expect(catchAll.title.toLowerCase()).toContain("anything");
  });

  it("fires the ad-referral recipe on the referral trigger, with no keyword fields it doesn't need", () => {
    const referral = getTemplateById("referral-welcome")!;
    expect(referral.setup!.definition.trigger).toEqual({ type: "referral" });
  });

  it("fires the opt-in recipe on the optin trigger", () => {
    const optin = getTemplateById("optin-confirmation")!;
    expect(optin.setup!.definition.trigger).toEqual({ type: "optin" });
  });

  it("covers every trigger type the engine supports across the recipe set", () => {
    const covered = new Set(basicAutomationTemplates.map((template) => template.setup!.definition.trigger.type));
    expect(covered).toEqual(new Set(["comment", "message", "referral", "optin", "first_contact", "story_mention", "story_reply"]));
  });

  it("ships the India-first D2C and creator recipes", () => {
    for (const id of [
      "lead-magnet-comment",
      "price-list-responder",
      "course-faq-booking",
      "event-registration",
      "influencer-collab-intake",
      "giveaway-comment-entry",
      "offer-followup",
    ]) {
      expect(getTemplateById(id), `${id} is missing`).toBeDefined();
    }
  });

  it("builds the price-list responder on an image card with a caption", () => {
    const firstAction = classic(getTemplateById("price-list-responder")).actions[0];
    expect(firstAction.type).toBe("send_image");
    expect(firstAction.type === "send_image" && Boolean(firstAction.caption)).toBe(true);
  });

  it("collects typed fields in the collab and event intakes", () => {
    const collab = classic(getTemplateById("influencer-collab-intake"));
    expect(collab.emailCapture?.fields?.map((field) => field.id)).toEqual(["niche", "handle"]);
    expect(collab.emailCapture?.notifyUrl).toBeDefined();

    const event = classic(getTemplateById("event-registration"));
    expect(event.emailCapture?.fields?.some((field) => field.kind === "phone")).toBe(true);
  });

  it("schedules a follow-up nudge in the offer recipe", () => {
    const offer = classic(getTemplateById("offer-followup"));
    expect(offer.followUps?.[0]?.delayMinutes).toBe(24 * 60);
  });
});
