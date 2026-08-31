import { describe, expect, it } from "vitest";
import { basicAutomationTemplates } from "../templates";
import type { FlowDefinitionV1 } from "../types";
import {
  channelCapabilities,
  deriveAutomationSurface,
  getChannelCapability,
  validateDefinitionForTarget,
} from "./registry";

const pageDefinition: FlowDefinitionV1 = {
  version: 1,
  trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply", text: "Thanks for commenting." }],
};

describe("channel capability registry", () => {
  it("resolves every supported provider and surface to one unique capability", () => {
    expect(channelCapabilities.map((capability) => capability.id)).toEqual([
      "instagram-comment",
      "instagram-messaging",
      "facebook-page-comment",
    ]);
    expect(new Set(channelCapabilities.map((capability) => capability.id)).size).toBe(3);
    expect(getChannelCapability({ provider: "FACEBOOK", surface: "COMMENT" }).id).toBe("facebook-page-comment");
    expect(() => getChannelCapability({ provider: "FACEBOOK", surface: "MESSAGING" })).toThrow("unsupported_channel");
  });

  it("keeps Facebook Page comments public-only and declares every required Page permission", () => {
    const capability = getChannelCapability({ provider: "FACEBOOK", surface: "COMMENT" });
    expect(capability.triggers).toEqual(["comment"]);
    expect(capability.actions).toEqual(["private_reply"]);
    expect(capability.actionSemantics.private_reply).toBe("public_page_reply");
    expect(capability.requiredPermissions).toEqual([
      "pages_show_list",
      "pages_read_engagement",
      "pages_read_user_content",
      "pages_manage_engagement",
    ]);
    expect(capability.actions).not.toContain("send_text");
  });

  it("derives surface from the trigger family and rejects provider-incompatible definitions with field paths", () => {
    expect(deriveAutomationSurface(pageDefinition)).toBe("COMMENT");
    expect(deriveAutomationSurface({
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Hello" }],
    })).toBe("MESSAGING");

    expect(validateDefinitionForTarget(pageDefinition, { provider: "FACEBOOK", surface: "COMMENT" })).toEqual([]);
    expect(validateDefinitionForTarget({
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Hello" }],
    }, { provider: "FACEBOOK", surface: "COMMENT" })).toEqual([
      { path: ["trigger", "type"], message: "Facebook Page comments do not support message triggers" },
      { path: ["actions", 0, "type"], message: "Facebook Page comments do not support send_text actions" },
    ]);
  });

  it("maps every legacy template to an existing Instagram capability", () => {
    for (const template of basicAutomationTemplates) {
      const surface = deriveAutomationSurface(template.setup.definition);
      expect(getChannelCapability({ provider: "INSTAGRAM", surface })).toBeDefined();
      expect(validateDefinitionForTarget(template.setup.definition, { provider: "INSTAGRAM", surface })).toEqual([]);
    }
  });
});
