import { describe, expect, it } from "vitest";
import { describeOnboarding } from "./about";

const base = { workspaceId: "w1", step: 1, existingWorkspace: false, createdAt: "2026-10-12T00:00:00.000Z", updatedAt: "2026-10-12T00:00:00.000Z" };

describe("describeOnboarding", () => {
  it("summarises finished answers in plain words", () => {
    const about = describeOnboarding({
      ...base,
      step: 9,
      completedAt: "2026-10-12T05:00:00.000Z",
      answers: { accountType: "brand", niches: ["fashion", "other"], nicheOther: "Saree drapes", audience: "10k_50k", channels: ["instagram", "facebook"], goals: ["sell", "faq"], dailyVolume: "50_200", replyMode: "team" },
    });
    expect(about).toMatchObject({ status: "completed", at: "2026-10-12T05:00:00.000Z" });
    expect(about.rows).toEqual([
      { label: "Type", value: "Brand or shop" },
      { label: "Space", value: "Fashion, Saree drapes" },
      { label: "Audience", value: "10k to 50k on Instagram, Facebook Page" },
      { label: "Goals", value: "Sell products, Answer common questions" },
      { label: "Comments and DMs a day", value: "50 to 200" },
      { label: "Replies today", value: "My team does" },
    ]);
  });

  it("tells skipped, in-progress, untouched and pre-existing workspaces apart", () => {
    expect(describeOnboarding(null).status).toBe("not_started");
    expect(describeOnboarding({ ...base, answers: {}, skippedAt: "2026-10-12T01:00:00.000Z" }).status).toBe("skipped");
    expect(describeOnboarding({ ...base, answers: { accountType: "coach" }, step: 3 })).toMatchObject({ status: "in_progress", progress: "Step 3 of 9" });
    expect(describeOnboarding({ ...base, answers: {}, existingWorkspace: true }).status).toBe("existing");
  });
});
