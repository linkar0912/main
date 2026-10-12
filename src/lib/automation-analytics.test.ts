import { describe, expect, it } from "vitest";
import {
  automationFigures,
  campaignFunnel,
  funnelDropSentence,
  funnelSteps,
  normalizeAutomationAnalytics,
} from "./automation-analytics";
import { chartLabelCount, parseRange } from "./analytics-range";
import { labelIndexes } from "@/src/components/trend-chart";
import type { AutomationRecord } from "./repository";

const zero = { commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 };

function v2(followRequired: boolean): Pick<AutomationRecord, "definition"> {
  return {
    definition: {
      version: 2,
      trigger: { type: "comment", source: "all_media", mediaIds: [], mediaSnapshots: [], match: "any", keywords: [] },
      publicReplies: [],
      openingMessage: { text: "Hi", optInButtonLabel: "Send it" },
      followGate: { required: followRequired, notFollowingMessage: "", recheckButtonLabel: "" },
      delivery: { text: "Here", url: "https://example.com" },
    },
  } as Pick<AutomationRecord, "definition">;
}

describe("analytics range", () => {
  it("accepts only the windows Home and the API offer", () => {
    expect([parseRange("7"), parseRange(14), parseRange("30")]).toEqual([7, 14, 30]);
    expect([parseRange("90"), parseRange(""), parseRange(null), parseRange("7days")]).toEqual([null, null, null, null]);
  });

  it("labels every day for 7, every other day for 14 and every fifth day for 30", () => {
    expect(labelIndexes(7, chartLabelCount(7))).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(labelIndexes(14, chartLabelCount(14))).toEqual([1, 3, 5, 7, 9, 11, 13]);
    expect(labelIndexes(30, chartLabelCount(30))).toEqual([4, 9, 14, 19, 24, 29]);
  });
});

describe("automation figures", () => {
  it("sums the window and keeps link clicks for campaigns only", () => {
    const data = normalizeAutomationAnalytics({
      timeseries: { days: 7, sentPerDay: [{ day: "a", count: 4 }, { day: "b", count: 6 }], participantsPerDay: [{ day: "a", count: 3 }] },
      outcome: { sent: 10, failed: 2, skipped: 0 },
      clicks: 5,
      previous: { sent: 20, reached: 1, failed: 0, clicks: 2, journey: zero },
    }, 7);
    expect(automationFigures(data, true)).toMatchObject({ days: 7, sent: 10, reached: 3, failed: 2, clicks: 5, empty: false, previous: { sent: 20, clicks: 2 } });
    expect(automationFigures(data, false).clicks).toBeNull();
  });

  it("calls a window with nothing in it or the one before empty", () => {
    const data = normalizeAutomationAnalytics({}, 14);
    expect(data.timeseries.days).toBe(14);
    expect(automationFigures(data, false).empty).toBe(true);
    const lastWindowOnly = normalizeAutomationAnalytics({ previous: { sent: 4, reached: 0, failed: 0, clicks: 0, journey: zero } }, 14);
    expect(automationFigures(lastWindowOnly, false).empty).toBe(false);
  });
});

describe("campaign funnel", () => {
  it("has a follow step only when the campaign asks people to follow, and ends at the click", () => {
    const journey = { commented: 40, openingSent: 38, optedIn: 20, followed: 15, linkSent: 15 };
    expect(campaignFunnel(v2(true), journey, 6)?.map((step) => step.label)).toEqual(["Commented", "Got the DM", "Tapped the button", "Followed", "Got the link", "Opened the link"]);
    expect(campaignFunnel(v2(false), journey, 6)?.map((step) => step.key)).not.toContain("followed");
    expect(campaignFunnel({ definition: { version: 1 } } as Pick<AutomationRecord, "definition">, journey, 6)).toBeNull();
  });

  it("works out each step's share of the one before", () => {
    const steps = funnelSteps([
      { key: "a", label: "A", count: 50 },
      { key: "b", label: "B", count: 40 },
      { key: "c", label: "C", count: 0 },
      { key: "d", label: "D", count: 3 },
    ]);
    expect(steps.map((step) => step.kept)).toEqual([null, 80, 0, null]);
  });

  it("names the biggest drop in one sentence, unless the sample is tiny or nothing leaks", () => {
    const steps = funnelSteps([
      { key: "a", label: "Commented", count: 100 },
      { key: "b", label: "Got the DM", count: 95 },
      { key: "c", label: "Tapped the button", count: 40 },
      { key: "d", label: "Got the link", count: 38 },
    ]);
    expect(funnelDropSentence(steps)).toBe("The biggest drop is before “Tapped the button”: 58% of people at “Got the DM” went no further.");
    expect(funnelDropSentence(funnelSteps([{ key: "a", label: "A", count: 5 }, { key: "b", label: "B", count: 1 }]))).toBeNull();
    expect(funnelDropSentence(funnelSteps([{ key: "a", label: "A", count: 50 }, { key: "b", label: "B", count: 48 }]))).toBeNull();
  });
});
