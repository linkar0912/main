import { describe, expect, it } from "vitest";
import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import { estimateTimeBack, fitPlan, formatDurationRange, matchedShare, summarisePosts } from "./plan";

describe("matchedShare", () => {
  it("uses a stated default when no goal was picked", () => {
    expect(matchedShare(undefined)).toBe(0.3);
    expect(matchedShare([])).toBe(0.3);
  });

  it("combines overlapping goals without passing 100% and rounds to tenths", () => {
    // 1 - (1-.35)(1-.3) = .545 -> .5
    expect(matchedShare(["faq", "links"])).toBe(0.5);
    // Every goal: capped at .8
    expect(matchedShare(["faq", "links", "sell", "leads", "giveaways", "grow", "book"])).toBe(0.8);
  });

  it("never claims less than two in ten", () => {
    expect(matchedShare(["book"])).toBe(0.2);
  });
});

describe("estimateTimeBack", () => {
  it("is volume x share x 30-45 seconds per reply over 30 days", () => {
    const result = estimateTimeBack({ dailyVolume: "10_50", goals: ["faq", "links"], replyMode: "myself" });
    // 30 a day x .5 x 30 days = 450 replies; 450 x 30s = 225 min, 450 x 45s = 337.5 min
    expect(result).toEqual({ kind: "time", perDay: 30, share: 0.5, handledPerMonth: 450, minutesLow: 225, minutesHigh: 338 });
  });

  it("talks about missed messages when they mostly do not reply today", () => {
    expect(estimateTimeBack({ dailyVolume: "under_10", replyMode: "none" })?.kind).toBe("missed");
  });

  it("returns nothing without a volume answer instead of inventing one", () => {
    expect(estimateTimeBack({ goals: ["sell"] })).toBeNull();
  });
});

describe("formatDurationRange", () => {
  it("stays in minutes under an hour and a half", () => {
    expect(formatDurationRange(27, 41)).toEqual({ low: 27, high: 41, unit: "minutes" });
  });

  it("switches to whole hours above that", () => {
    expect(formatDurationRange(225, 338)).toEqual({ low: 4, high: 6, unit: "hours" });
  });
});

describe("fitPlan", () => {
  it("keeps a small account on the free plan", () => {
    const fit = fitPlan({ dailyVolume: "under_10", goals: ["faq"] });
    // 6 x .4 x 30 = 72 replies -> 144 messages
    expect(fit).toMatchObject({ key: "free", estimatedMessages: 144, monthlyDeliveryLimit: FREE_BILLING_PLAN.monthlyDeliveryLimit, reason: "free" });
  });

  it("picks the smallest plan whose message allowance covers the estimate", () => {
    // 120 x .5 x 30 = 1,800 replies -> 3,600 messages: over Free's 1,000, within Creator's 5,000
    expect(fitPlan({ dailyVolume: "50_200", goals: ["faq", "links"] })).toMatchObject({ key: "creator", estimatedMessages: 3_600, reason: "volume" });
    // 500 x .5 x 30 = 7,500 -> 15,000 messages: Growth
    expect(fitPlan({ dailyVolume: "200_1000", goals: ["faq", "links"] })?.key).toBe("growth");
  });

  it("needs a second seat when a team replies today", () => {
    expect(fitPlan({ dailyVolume: "under_10", replyMode: "team" })).toMatchObject({ key: "creator", reason: "team" });
  });

  it("tops out at the biggest plan rather than inventing one", () => {
    expect(fitPlan({ dailyVolume: "1000_plus", goals: ["faq", "links", "sell", "leads"] })?.key).toBe(BILLING_PLANS.agency.key);
  });
});

describe("summarisePosts", () => {
  it("reads only real comment counts from the latest twelve posts", () => {
    const media = [250, 210, 40, 5, 0, 12, 300, 18, 9, 1, 2, 3, 999].map((commentsCount) => ({ commentsCount }));
    expect(summarisePosts(media)).toEqual({
      posts: 12,
      comments: 250 + 210 + 40 + 5 + 0 + 12 + 300 + 18 + 9 + 1 + 2 + 3,
      busiest: 300,
      over: { threshold: 200, count: 3 },
    });
  });

  it("uses a lower round threshold for smaller accounts", () => {
    expect(summarisePosts([{ commentsCount: 60 }, { commentsCount: 20 }])?.over).toEqual({ threshold: 50, count: 1 });
    expect(summarisePosts([{ commentsCount: 6 }])?.over).toBeNull();
  });

  it("shows nothing when Meta gave no counts", () => {
    expect(summarisePosts([{}, { commentsCount: null }])).toBeNull();
    expect(summarisePosts([])).toBeNull();
  });
});
