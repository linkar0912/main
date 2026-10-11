/**
 * The plain-language maths behind Home's and Insights' headlines: how a
 * window compares with the one before it, and where people fall out of the
 * comment-to-link journey. Pure so the numbers and the sentences built from
 * them are tested together.
 */

export type DayPoint = { day: string; count: number };

export type PeriodChange =
  /** Nothing in either window. */
  | { kind: "none" }
  /** Activity now, none in the window before. */
  | { kind: "new" }
  /** Rounds to 0%. */
  | { kind: "steady" }
  | { kind: "up" | "down"; percent: number };

export function sumPoints(points: readonly DayPoint[]): number {
  return points.reduce((total, point) => total + point.count, 0);
}

export function periodChange(current: number, previous: number): PeriodChange {
  if (current === 0 && previous === 0) return { kind: "none" };
  if (previous === 0) return { kind: "new" };
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { kind: "steady" };
  return percent > 0 ? { kind: "up", percent } : { kind: "down", percent: -percent };
}

/** Short badge text: "+18%", "-12%", "New", "No change"; null when there is nothing to compare. */
export function changeBadge(change: PeriodChange): string | null {
  switch (change.kind) {
    case "none": return null;
    case "new": return "New";
    case "steady": return "No change";
    case "up": return `+${change.percent.toLocaleString("en-IN")}%`;
    case "down": return `-${change.percent.toLocaleString("en-IN")}%`;
  }
}

/** The same comparison read aloud, e.g. "Up 18% on the previous 14 days". */
export function changeSentence(change: PeriodChange, days: number): string | null {
  const window = `the previous ${days} days`;
  switch (change.kind) {
    case "none": return null;
    case "new": return `None in ${window}`;
    case "steady": return `Same as ${window}`;
    case "up": return `Up ${change.percent.toLocaleString("en-IN")}% on ${window}`;
    case "down": return `Down ${change.percent.toLocaleString("en-IN")}% on ${window}`;
  }
}

/** The Insights headline: one sentence about replies in the chosen window. */
export function repliesHeadline(change: PeriodChange, days: number): string {
  switch (change.kind) {
    case "none": return `No replies went out in the last ${days} days.`;
    case "new": return `Your automations started replying in the last ${days} days.`;
    case "steady": return `Replies are holding steady against the previous ${days} days.`;
    case "up": return `Replies are up ${change.percent.toLocaleString("en-IN")}% on the previous ${days} days.`;
    case "down": return `Replies are down ${change.percent.toLocaleString("en-IN")}% on the previous ${days} days.`;
  }
}

export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;
}

/** "949 replies reached 753 people. Diwali sale link sent the most (412)." */
export function repliesSupport({ sent, reached, top }: {
  sent: number;
  reached: number;
  top?: { name: string; sent: number } | null;
}): string {
  if (sent === 0 && reached === 0) return "Numbers fill in here as your automations reply to comments and messages.";
  const lead = `${plural(sent, "reply", "replies")} reached ${plural(reached, "person", "people")}.`;
  return top && top.sent > 0 ? `${lead} ${top.name} sent the most (${top.sent.toLocaleString("en-IN")}).` : lead;
}

export type JourneyCounts = {
  commented: number;
  openingSent: number;
  optedIn: number;
  followed: number;
  linkSent: number;
};

export type JourneyStep = {
  key: keyof JourneyCounts;
  label: string;
  count: number;
  /** Share of the step before that made it here (0-100); null for the first step. */
  kept: number | null;
};

// Same stage names as the campaign funnel on each automation's activity page.
const JOURNEY_LABELS: Array<[keyof JourneyCounts, string]> = [
  ["commented", "Commented"],
  ["openingSent", "Got the DM"],
  ["optedIn", "Opted in"],
  ["followed", "Followed"],
  ["linkSent", "Got the link"],
];

export function journeySteps(counts: JourneyCounts): JourneyStep[] {
  return JOURNEY_LABELS.map(([key, label], index) => {
    const count = counts[key] ?? 0;
    if (index === 0) return { key, label, count, kept: null };
    const before = counts[JOURNEY_LABELS[index - 1][0]] ?? 0;
    return { key, label, count, kept: before > 0 ? Math.min(100, Math.round((count / before) * 100)) : null };
  });
}

const DROP_ADVICE: Record<keyof JourneyCounts, string> = {
  commented: "",
  openingSent: "Some people who commented never got the DM. Failed sends are listed on Home.",
  optedIn: "A clearer opening message or button label usually gets more people to tap.",
  followed: "Saying why to follow, or dropping the follow step, usually keeps more people going.",
  linkSent: "Some people finished every step but didn't get the link. Failed sends are listed on Home.",
};

/**
 * The single biggest leak in the journey, as one sentence, or null when the
 * sample is too small to mean anything or every step keeps 90%+.
 */
export function biggestDrop(steps: readonly JourneyStep[]): { step: JourneyStep; sentence: string } | null {
  let worst: { step: JourneyStep; before: JourneyStep } | null = null;
  steps.forEach((step, index) => {
    if (index === 0 || step.kept === null) return;
    const before = steps[index - 1];
    if (before.count < 10) return;
    if (!worst || step.kept < (worst.step.kept ?? 100)) worst = { step, before };
  });
  if (!worst) return null;
  const { step, before } = worst as { step: JourneyStep; before: JourneyStep };
  if (step.kept === null || step.kept >= 90) return null;
  const lost = 100 - step.kept;
  return {
    step,
    sentence: `The biggest drop is at “${step.label}”: ${lost}% of people who ${pastTense(before.key)} stopped there. ${DROP_ADVICE[step.key]}`.trim(),
  };
}

function pastTense(key: keyof JourneyCounts): string {
  switch (key) {
    case "commented": return "commented";
    case "openingSent": return "got the DM";
    case "optedIn": return "opted in";
    case "followed": return "followed";
    case "linkSent": return "got the link";
  }
}
