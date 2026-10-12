import { describe, expect, it } from "vitest";
import {
  automationFigures,
  campaignFunnel,
  captureFunnel,
  collectsEmail,
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

describe("email capture", () => {
  const classic = (trigger: string, emailCapture: boolean) => ({
    definition: {
      version: 1,
      trigger: { type: trigger },
      conditions: [],
      actions: [],
      ...(emailCapture ? { emailCapture: { promptText: "Email?", confirmationText: "Thanks" } } : {}),
    },
  }) as unknown as Pick<AutomationRecord, "definition">;

  it("applies to classic DM automations that ask for an email, never comment triggers or campaigns", () => {
    expect(collectsEmail(classic("message", true))).toBe(true);
    expect(collectsEmail(classic("story_reply", true))).toBe(true);
    expect(collectsEmail(classic("message", false))).toBe(false);
    expect(collectsEmail(classic("comment", true))).toBe(false);
    expect(collectsEmail(v2(false))).toBe(false);
  });

  it("counts emails collected, their share of people messaged and the previous window", () => {
    const data = normalizeAutomationAnalytics({
      capture: { messaged: 40, asked: 30, captured: 10 },
      previous: { sent: 0, reached: 0, failed: 0, clicks: 0, captured: 4, journey: zero },
    }, 14);
    expect(automationFigures(data, false)).toMatchObject({ captured: 10, capturedShare: 25, previous: { captured: 4 }, empty: false });
    // Not an email-capture automation: no figure at all, not a zero.
    const plain = automationFigures(normalizeAutomationAnalytics({}, 14), false);
    expect(plain.captured).toBeNull();
    expect(plain.capturedShare).toBeNull();
    // An older payload without `captured` in previous reads as zero.
    expect(normalizeAutomationAnalytics({ previous: { sent: 1 } }, 7).previous.captured).toBe(0);
    expect(automationFigures(normalizeAutomationAnalytics({ capture: { messaged: 0, asked: 0, captured: 0 } }, 7), false).capturedShare).toBeNull();
  });

  it("builds the Messaged, Asked for email, Gave email funnel", () => {
    const steps = captureFunnel({ messaged: 50, asked: 40, captured: 12 });
    expect(steps?.map((step) => [step.label, step.count, step.kept])).toEqual([
      ["Messaged", 50, null],
      ["Asked for email", 40, 80],
      ["Gave email", 12, 30],
    ]);
    expect(funnelDropSentence(steps!)).toBe("The biggest drop is before “Gave email”: 70% of people at “Asked for email” went no further.");
    expect(captureFunnel(null)).toBeNull();
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
