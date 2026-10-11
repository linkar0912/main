import { describe, expect, it } from "vitest";
import { getTemplateById } from "@/src/lib/automation/templates";
import { FOLLOW_GATE_ID, rankTemplates, recommendTemplates, recommendationProvider, templateHref } from "./recommendations";

describe("recommendTemplates", () => {
  it("leads with what the person wants from their DMs", () => {
    const ids = recommendTemplates({ goals: ["sell"], accountType: "brand", niches: ["fashion"] }).map((item) => item.id);
    expect(ids[0]).toBe("price-list-responder");
    expect(ids).toContain("affiliate-link");
  });

  it("spreads the three picks across different jobs", () => {
    const picks = recommendTemplates({ goals: ["leads", "faq", "links"], accountType: "coach" });
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((item) => item.trigger)).size).toBeGreaterThan(1);
  });

  it("puts a coach's booking flow first when they want calls booked", () => {
    expect(recommendTemplates({ goals: ["book"], accountType: "coach", niches: ["education"] })[0].id).toBe("course-faq-booking");
  });

  it("recommends the follow-gated link to someone growing followers", () => {
    const picks = recommendTemplates({ goals: ["grow"], accountType: "creator" });
    expect(picks[0].id).toBe(FOLLOW_GATE_ID);
    expect(picks[0].href).toBe("/automations/new?type=campaign");
  });

  it("explains each pick in one line naming the goal it serves", () => {
    const [first] = recommendTemplates({ goals: ["giveaways"] });
    expect(first.why).toMatch(/^Fits “Run giveaways”: /);
  });

  it("falls back to popular templates with no answers, without inventing a reason", () => {
    const picks = recommendTemplates({});
    expect(picks).toHaveLength(3);
    for (const pick of picks) expect(pick.why).not.toMatch(/^Fits/);
  });

  it("only offers Facebook Page templates to a Facebook-only account, pinned to its Page", () => {
    expect(recommendationProvider({ channels: ["facebook"] })).toBe("FACEBOOK");
    const picks = recommendTemplates({ channels: ["facebook"], goals: ["sell"] }, 3, { facebookPageId: "page_1" });
    for (const pick of picks) {
      expect(pick.provider).toBe("FACEBOOK");
      expect(pick.href).toContain("provider=facebook&surface=comment&connection=page_1");
    }
  });

  it("links every pick to a real template the builder can prefill", () => {
    for (const pick of rankTemplates({ goals: ["sell", "faq"] })) {
      if (pick.id === FOLLOW_GATE_ID) continue;
      expect(getTemplateById(pick.id)).toBeDefined();
      expect(pick.href).toBe(templateHref(pick.id, pick.provider));
    }
  });

  it("is deterministic", () => {
    const answers = { goals: ["sell", "leads"] as const, accountType: "brand" as const };
    expect(recommendTemplates({ ...answers, goals: [...answers.goals] })).toEqual(recommendTemplates({ ...answers, goals: [...answers.goals] }));
  });
});
