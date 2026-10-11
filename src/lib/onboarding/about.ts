import type { WorkspaceOnboardingRecord } from "@/src/lib/repository";
import {
  ACCOUNT_TYPE_LABELS,
  AUDIENCE_LABELS,
  CHANNEL_LABELS,
  DAILY_VOLUME_LABELS,
  GOAL_LABELS,
  NICHE_LABELS,
  OWNER_STEP_COUNT,
  REPLY_MODE_LABELS,
  readStoredAnswers,
} from "./answers";

/** The owner console's read-only "About this workspace" block. */
export type WorkspaceAbout = {
  status: "completed" | "skipped" | "in_progress" | "not_started" | "existing";
  /** When it was completed or skipped (ISO). */
  at: string | null;
  /** "Step 4 of 9" while in progress. */
  progress: string | null;
  rows: Array<{ label: string; value: string }>;
};

function joinLabels(values: readonly string[] | undefined, labels: Record<string, string>): string | null {
  if (!values || values.length === 0) return null;
  return values.map((value) => labels[value] ?? value).join(", ");
}

/** Plain-language summary of a workspace's onboarding answers. */
export function describeOnboarding(record: WorkspaceOnboardingRecord | null): WorkspaceAbout {
  const answers = readStoredAnswers(record?.answers);
  const niches = joinLabels(answers.niches?.filter((niche) => niche !== "other"), NICHE_LABELS);
  const otherNiche = answers.niches?.includes("other") ? answers.nicheOther || "Other" : null;
  const channels = joinLabels(answers.channels, CHANNEL_LABELS);
  const rows: WorkspaceAbout["rows"] = [];
  const add = (label: string, value: string | null | undefined) => { if (value) rows.push({ label, value }); };
  add("Type", answers.accountType ? ACCOUNT_TYPE_LABELS[answers.accountType] : null);
  add("Space", [niches, otherNiche].filter(Boolean).join(", ") || null);
  add("Audience", answers.audience ? `${AUDIENCE_LABELS[answers.audience]}${channels ? ` on ${channels}` : ""}` : channels);
  add("Goals", joinLabels(answers.goals, GOAL_LABELS));
  add("Comments and DMs a day", answers.dailyVolume ? DAILY_VOLUME_LABELS[answers.dailyVolume] : null);
  add("Replies today", answers.replyMode ? REPLY_MODE_LABELS[answers.replyMode] : null);

  if (!record) return { status: "not_started", at: null, progress: null, rows };
  if (record.completedAt) return { status: "completed", at: record.completedAt, progress: null, rows };
  if (record.skippedAt) return { status: "skipped", at: record.skippedAt, progress: null, rows };
  if (record.existingWorkspace && rows.length === 0 && record.step <= 1) return { status: "existing", at: null, progress: null, rows };
  return { status: "in_progress", at: null, progress: `Step ${Math.min(record.step, OWNER_STEP_COUNT)} of ${OWNER_STEP_COUNT}`, rows };
}
