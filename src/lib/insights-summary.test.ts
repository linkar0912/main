import { describe, expect, it } from "vitest";
import {
  biggestDrop,
  changeBadge,
  changeSentence,
  journeySteps,
  periodChange,
  repliesHeadline,
  repliesSupport,
  sumPoints,
} from "./insights-summary";

describe("periodChange", () => {
  it("compares this window with the one before, rounded to a whole percent", () => {
    expect(periodChange(118, 100)).toEqual({ kind: "up", percent: 18 });
    expect(periodChange(88, 100)).toEqual({ kind: "down", percent: 12 });
    expect(periodChange(1002, 1000)).toEqual({ kind: "steady" });
  });

  it("never divides by zero", () => {
    expect(periodChange(0, 0)).toEqual({ kind: "none" });
    expect(periodChange(5, 0)).toEqual({ kind: "new" });
    expect(periodChange(0, 40)).toEqual({ kind: "down", percent: 100 });
  });
});

describe("headline copy", () => {
  it("states the change in one plain sentence", () => {
    expect(repliesHeadline(periodChange(118, 100), 14)).toBe("Replies are up 18% on the previous 14 days.");
    expect(repliesHeadline(periodChange(70, 100), 7)).toBe("Replies are down 30% on the previous 7 days.");
    expect(repliesHeadline(periodChange(100, 100), 30)).toBe("Replies are holding steady against the previous 30 days.");
    expect(repliesHeadline(periodChange(0, 0), 14)).toBe("No replies went out in the last 14 days.");
    expect(repliesHeadline(periodChange(9, 0), 14)).toBe("Your automations started replying in the last 14 days.");
  });

  it("gives figures a short badge and a spoken comparison", () => {
    expect(changeBadge(periodChange(118, 100))).toBe("+18%");
    expect(changeBadge(periodChange(88, 100))).toBe("-12%");
    expect(changeBadge(periodChange(0, 0))).toBeNull();
    expect(changeSentence(periodChange(118, 100), 14)).toBe("Up 18% on the previous 14 days");
    expect(changeSentence(periodChange(3, 0), 14)).toBe("None in the previous 14 days");
    expect(changeSentence(periodChange(0, 0), 14)).toBeNull();
  });

  it("names the automation that did the most, with singular and plural nouns", () => {
    expect(repliesSupport({ sent: 949, reached: 753, top: { name: "Diwali sale link", sent: 412 } }))
      .toBe("949 replies reached 753 people. Diwali sale link sent the most (412).");
    expect(repliesSupport({ sent: 1, reached: 1 })).toBe("1 reply reached 1 person.");
    expect(repliesSupport({ sent: 0, reached: 0 })).toMatch(/fill in here/);
  });

  it("sums a daily series", () => {
    expect(sumPoints([{ day: "2026-10-01", count: 2 }, { day: "2026-10-02", count: 5 }])).toBe(7);
  });
});

describe("journey", () => {
  const counts = { commented: 1_240, openingSent: 1_182, optedIn: 806, followed: 612, linkSent: 588 };

  it("turns cumulative counts into steps with the share kept from the step before", () => {
    const steps = journeySteps(counts);
    expect(steps.map((step) => step.label)).toEqual(["Commented", "Got the DM", "Opted in", "Followed", "Got the link"]);
    expect(steps.map((step) => step.kept)).toEqual([null, 95, 68, 76, 96]);
  });

  it("calls out the single biggest drop with advice for that step", () => {
    const drop = biggestDrop(journeySteps(counts));
    expect(drop?.step.label).toBe("Opted in");
    expect(drop?.sentence).toMatch(/^The biggest drop is at “Opted in”: 32% of people who got the DM stopped there\./);
  });

  it("stays quiet when every step keeps most people or the sample is tiny", () => {
    expect(biggestDrop(journeySteps({ commented: 100, openingSent: 98, optedIn: 95, followed: 92, linkSent: 90 }))).toBeNull();
    expect(biggestDrop(journeySteps({ commented: 6, openingSent: 2, optedIn: 1, followed: 0, linkSent: 0 }))).toBeNull();
  });
});
