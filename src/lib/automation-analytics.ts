/**
 * The maths behind one automation's analytics view (its Overview tab):
 * which figures the data supports for this kind of automation, the funnel
 * steps it really has, and the one sentence about where people stop. Pure,
 * so the numbers and the words built from them are tested together.
 */
import type { AutomationRecord } from "./repository";
import { sumPoints, type DayPoint, type JourneyCounts } from "./insights-summary";

export type MediaPerformance = { mediaId: string; matched: number; delivered: number; clicked: number };

/** `/api/insights?include=automation&automationId=&days=` */
export type AutomationAnalytics = {
  timeseries: { days: number; participantsPerDay: DayPoint[]; sentPerDay: DayPoint[] };
  outcome: { sent: number; failed: number; skipped: number };
  /** People who commented inside the window, and how far they got. */
  journey: JourneyCounts;
  /** Of those, how many opened the link they were sent. */
  clicks: number;
  mediaPerformance: MediaPerformance[];
  previous: { sent: number; reached: number; failed: number; clicks: number; journey: JourneyCounts };
};

const EMPTY_JOURNEY: JourneyCounts = { commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 };

/** Fills anything an older or partial payload left out, so the view never reads undefined. */
export function normalizeAutomationAnalytics(payload: Partial<AutomationAnalytics> | null | undefined, days: number): AutomationAnalytics {
  return {
    timeseries: {
      days: payload?.timeseries?.days ?? days,
      participantsPerDay: payload?.timeseries?.participantsPerDay ?? [],
      sentPerDay: payload?.timeseries?.sentPerDay ?? [],
    },
    outcome: { sent: 0, failed: 0, skipped: 0, ...payload?.outcome },
    journey: { ...EMPTY_JOURNEY, ...payload?.journey },
    clicks: payload?.clicks ?? 0,
    mediaPerformance: payload?.mediaPerformance ?? [],
    previous: {
      sent: payload?.previous?.sent ?? 0,
      reached: payload?.previous?.reached ?? 0,
      failed: payload?.previous?.failed ?? 0,
      clicks: payload?.previous?.clicks ?? 0,
      journey: { ...EMPTY_JOURNEY, ...payload?.previous?.journey },
    },
  };
}

/** Comment-to-link campaigns (v2) keep a per-person journey; classic rules don't. */
export function isCampaign(automation: Pick<AutomationRecord, "definition">): boolean {
  return automation.definition.version === 2;
}

export type AutomationFigures = {
  days: number;
  sent: number;
  reached: number;
  failed: number;
  /** Link clicks for a comment-to-link campaign; null when this automation has no link to click. */
  clicks: number | null;
  previous: { sent: number; reached: number; failed: number; clicks: number };
  /** Nothing at all in this window or the one before: the view explains instead of showing zeros. */
  empty: boolean;
};

export function automationFigures(data: AutomationAnalytics, campaign: boolean): AutomationFigures {
  const sent = sumPoints(data.timeseries.sentPerDay);
  const reached = sumPoints(data.timeseries.participantsPerDay);
  const failed = data.outcome.failed;
  const clicks = campaign ? data.clicks : null;
  const empty = sent === 0 && reached === 0 && failed === 0
    && data.previous.sent === 0 && data.previous.reached === 0 && data.previous.failed === 0
    && data.journey.commented === 0 && data.previous.journey.commented === 0;
  return {
    days: data.timeseries.days,
    sent,
    reached,
    failed,
    clicks,
    previous: { sent: data.previous.sent, reached: data.previous.reached, failed: data.previous.failed, clicks: data.previous.clicks },
    empty,
  };
}

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  /** Share of the step before that made it here (0-100); null for the first step or when nobody reached the step before. */
  kept: number | null;
};

export function funnelSteps(steps: ReadonlyArray<{ key: string; label: string; count: number }>): FunnelStep[] {
  return steps.map((step, index) => {
    if (index === 0) return { ...step, kept: null };
    const before = steps[index - 1].count;
    return { ...step, kept: before > 0 ? Math.min(100, Math.round((step.count / before) * 100)) : null };
  });
}

/**
 * The steps this campaign really has: the follow step only when it asks
 * people to follow, and the click at the end (counted from the tracked
 * delivery link). Null for automations without a per-person journey.
 */
export function campaignFunnel(automation: Pick<AutomationRecord, "definition">, journey: JourneyCounts, clicks: number): FunnelStep[] | null {
  const definition = automation.definition;
  if (definition.version !== 2) return null;
  const steps = [
    { key: "commented", label: "Commented", count: journey.commented },
    { key: "openingSent", label: "Got the DM", count: journey.openingSent },
    { key: "optedIn", label: "Tapped the button", count: journey.optedIn },
    ...(definition.followGate?.required ? [{ key: "followed", label: "Followed", count: journey.followed }] : []),
    { key: "linkSent", label: "Got the link", count: journey.linkSent },
    { key: "clicked", label: "Opened the link", count: clicks },
  ];
  return funnelSteps(steps);
}

/**
 * "Most people stop before “Followed”: 24% of people who tapped the button
 * went no further." Null when the sample is too small to mean anything or
 * every step keeps 90% or more.
 */
export function funnelDropSentence(steps: readonly FunnelStep[]): string | null {
  let worst: { step: FunnelStep; before: FunnelStep } | null = null;
  steps.forEach((step, index) => {
    if (index === 0 || step.kept === null) return;
    const before = steps[index - 1];
    if (before.count < 10) return;
    if (!worst || step.kept < (worst.step.kept ?? 100)) worst = { step, before };
  });
  if (!worst) return null;
  const { step, before } = worst as { step: FunnelStep; before: FunnelStep };
  if (step.kept === null || step.kept >= 90) return null;
  return `The biggest drop is before “${step.label}”: ${100 - step.kept}% of people at “${before.label}” went no further.`;
}
