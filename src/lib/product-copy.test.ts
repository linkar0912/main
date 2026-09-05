import { describe, expect, it } from "vitest";
import { COMMON_ACTIONS, PRODUCT_NAVIGATION, PROVIDER_LABELS, STATUS_COPY } from "./product-copy";

describe("plain-language product vocabulary", () => {
  it("keeps the learned navigation labels stable", () => {
    expect(Object.values(PRODUCT_NAVIGATION)).toEqual([
      "Home", "Automations", "Quick Automation", "Insights", "Contacts", "Inbox", "Settings", "My Profile",
    ]);
  });

  it("uses named services and outcome-based actions", () => {
    expect(PROVIDER_LABELS).toEqual({ INSTAGRAM: "Instagram", FACEBOOK: "Facebook", EMAIL: "Email" });
    expect(COMMON_ACTIONS).toMatchObject({
      saveReply: "Save reply",
      connectInstagram: "Connect Instagram",
      applyInvite: "Apply invite",
      enableReplies: "Turn on automatic replies",
    });
    expect(STATUS_COPY).toMatchObject({ ACTIVE: "On", DRAFT: "Draft", PAUSED: "Off" });
  });
});
