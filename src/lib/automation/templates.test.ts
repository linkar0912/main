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
        expect(normalized.actions.every((action) => action.text.trim().length > 0)).toBe(true);
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
  });

  it("looks templates up by id", () => {
    expect(getTemplateById("default-reply")?.title).toContain("Default Reply");
    expect(getTemplateById("conversation-starters")?.setup).toBeDefined();
    expect(getTemplateById("does-not-exist")).toBeUndefined();
  });
});
