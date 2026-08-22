import { describe, expect, it } from "vitest";
import { validateFlowDefinition } from "./definition";
import { basicAutomationTemplates, getTemplateById } from "./templates";

describe("premade automation templates", () => {
  it("exposes unique template ids", () => {
    const ids = basicAutomationTemplates.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every available template a valid classic builder prefill", () => {
    for (const template of basicAutomationTemplates.filter((entry) => entry.available)) {
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

  it("keeps unavailable templates free of prefills and explains why", () => {
    for (const template of basicAutomationTemplates.filter((entry) => !entry.available)) {
      expect(template.setup).toBeUndefined();
      expect(template.unavailableNote?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it("looks templates up by id", () => {
    expect(getTemplateById("default-reply")?.title).toContain("Default Reply");
    expect(getTemplateById("conversation-starters")?.available).toBe(true);
    expect(getTemplateById("does-not-exist")).toBeUndefined();
  });
});
