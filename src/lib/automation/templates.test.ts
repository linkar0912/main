import { describe, expect, it } from "vitest";
import { validateFlowDefinition } from "./definition";
import { basicAutomationTemplates, getTemplateById } from "./templates";

describe("premade automation templates", () => {
  it("exposes unique template ids", () => {
    const ids = basicAutomationTemplates.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every template a valid classic builder prefill", () => {
    for (const template of basicAutomationTemplates) {
      const setup = template.setup;
      expect(setup, `${template.id} needs a setup prefill`).toBeDefined();
      const normalized = validateFlowDefinition(setup!.definition);
      expect(normalized.version).toBe(1);
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
      expect(["comment", "message", "referral", "optin", "first_contact", "story_mention"]).toContain(
        definition.trigger.type,
      );
      if (definition.emailCapture) {
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

  it("captures emails with the email-capture template", () => {
    const capture = getTemplateById("email-capture")!;
    expect(capture.setup!.definition.emailCapture).toBeDefined();
    expect(capture.setup!.definition.trigger.type).toBe("message");
    // The recipe fulfills its own promise: a delivery email ships with the capture.
    expect(capture.setup!.definition.emailCapture?.delivery?.subject.trim().length).toBeGreaterThan(0);
    expect(capture.setup!.definition.emailCapture?.delivery?.linkUrl).toBeDefined();
  });

  it("looks templates up by id", () => {
    expect(getTemplateById("default-reply")?.title).toContain("Default Reply");
    expect(getTemplateById("conversation-starters")?.setup).toBeDefined();
    expect(getTemplateById("does-not-exist")).toBeUndefined();
  });

  it("private-replies to comments instead of DMing, since that's the actual Meta action for a comment trigger", () => {
    for (const id of ["comment-link-dm", "comment-catch-all"]) {
      const template = getTemplateById(id)!;
      expect(template.setup!.definition.trigger.type).toBe("comment");
      expect(template.setup!.definition.actions.every((action) => action.type === "private_reply")).toBe(true);
    }
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
    expect(covered).toEqual(new Set(["comment", "message", "referral", "optin", "first_contact", "story_mention"]));
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
    const priceList = getTemplateById("price-list-responder")!;
    const firstAction = priceList.setup!.definition.actions[0];
    expect(firstAction.type).toBe("send_image");
    expect(firstAction.type === "send_image" && Boolean(firstAction.caption)).toBe(true);
  });

  it("collects typed fields in the collab and event intakes", () => {
    const collab = getTemplateById("influencer-collab-intake")!;
    expect(collab.setup!.definition.emailCapture?.fields?.map((field) => field.id)).toEqual(["niche", "handle"]);
    expect(collab.setup!.definition.emailCapture?.notifyUrl).toBeDefined();

    const event = getTemplateById("event-registration")!;
    expect(event.setup!.definition.emailCapture?.fields?.some((field) => field.kind === "phone")).toBe(true);
  });

  it("schedules a follow-up nudge in the offer recipe", () => {
    const offer = getTemplateById("offer-followup")!;
    expect(offer.setup!.definition.followUps?.[0]?.delayMinutes).toBe(24 * 60);
  });
});
