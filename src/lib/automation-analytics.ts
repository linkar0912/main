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
  /** People messaged, asked for an email and who gave one, inside the window; null unless the automation collects emails. */
  capture: EmailCaptureCounts | null;
  previous: { sent: number; reached: number; failed: number; clicks: number; captured: number; journey: JourneyCounts };
};

export type EmailCaptureCounts = { messaged: number; asked: number; captured: number };

const EMPTY_JOURNEY: JourneyCounts = { commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 };

/** Fills anything an older or partial payload left out, so the view never reads undefined. */
export type AutomationAnalyticsPayload = Partial<Omit<AutomationAnalytics, "previous" | "capture">> & {
  previous?: Partial<AutomationAnalytics["previous"]>;
  capture?: Partial<EmailCaptureCounts> | null;
};

export function normalizeAutomationAnalytics(payload: AutomationAnalyticsPayload | null | undefined, days: number): AutomationAnalytics {
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
    capture: payload?.capture
      ? { messaged: payload.capture.messaged ?? 0, asked: payload.capture.asked ?? 0, captured: payload.capture.captured ?? 0 }
      : null,
    previous: {
      sent: payload?.previous?.sent ?? 0,
      reached: payload?.previous?.reached ?? 0,
      failed: payload?.previous?.failed ?? 0,
      clicks: payload?.previous?.clicks ?? 0,
      captured: payload?.previous?.captured ?? 0,
      journey: { ...EMPTY_JOURNEY, ...payload?.previous?.journey },
    },
  };
}

/** Comment-to-link campaigns (v2) keep a per-person journey; classic rules don't. */
export function isCampaign(automation: Pick<AutomationRecord, "definition">): boolean {
  return automation.definition.version === 2;
}

/**
 * Classic automations that ask for an email in DMs. Comment triggers never
 * collect one (they may only send a single private reply), as in the runner.
 */
export function collectsEmail(automation: Pick<AutomationRecord, "definition">): boolean {
  const definition = automation.definition;
  return definition.version === 1 && Boolean(definition.emailCapture) && definition.trigger.type !== "comment";
}

export type AutomationFigures = {
  days: number;
  sent: number;
  reached: number;
  failed: number;
  /** Link clicks for a comment-to-link campaign; null when this automation has no link to click. */
  clicks: number | null;
  /** Emails collected by an email-capture automation; null when it does not ask for one. */
  captured: number | null;
  /** Share of the people it messaged who gave an email (0-100); null when it messaged nobody or does not ask. */
  capturedShare: number | null;
  previous: { sent: number; reached: number; failed: number; clicks: number; captured: number };
  /** Nothing at all in this window or the one before: the view explains instead of showing zeros. */
  empty: boolean;
};

export function automationFigures(data: AutomationAnalytics, campaign: boolean): AutomationFigures {
  const sent = sumPoints(data.timeseries.sentPerDay);
  const reached = sumPoints(data.timeseries.participantsPerDay);
  const failed = data.outcome.failed;
  const clicks = campaign ? data.clicks : null;
  const capture = data.capture;
  const captured = capture ? capture.captured : null;
  const capturedShare = capture && capture.messaged > 0 ? Math.min(100, Math.round((capture.captured / capture.messaged) * 100)) : null;
  const empty = sent === 0 && reached === 0 && failed === 0
    && data.previous.sent === 0 && data.previous.reached === 0 && data.previous.failed === 0
    && data.journey.commented === 0 && data.previous.journey.commented === 0
    && (captured ?? 0) === 0 && data.previous.captured === 0;
  return {
    days: data.timeseries.days,
    sent,
    reached,
    failed,
    clicks,
    captured,
    capturedShare,
    previous: {
      sent: data.previous.sent,
      reached: data.previous.reached,
      failed: data.previous.failed,
      clicks: data.previous.clicks,
      captured: data.previous.captured,
    },
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
 * An email-capture automation's steps, in people inside the window: who it
 * messaged, who it asked for an email (someone who already shared one is not
 * asked again) and who gave one. Null for automations that do not ask.
 */
export function captureFunnel(capture: EmailCaptureCounts | null): FunnelStep[] | null {
  if (!capture) return null;
  return funnelSteps([
    { key: "messaged", label: "Messaged", count: capture.messaged },
    { key: "asked", label: "Asked for email", count: capture.asked },
    { key: "captured", label: "Gave email", count: capture.captured },
  ]);
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
