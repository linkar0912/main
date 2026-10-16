/**
 * Home's "Needs you" list: the few things that stop replies going out, in
 * order of how badly. Everything here is derived from data Home already
 * loads (connections, automations, recent failures, plan usage), so the
 * rules live in one pure function that tests can pin down.
 */

import { formatDateParts } from "./format-date";
import { parseAccountPauseReason, type AccountPausePlatform } from "./meta/errors";

export type AttentionTone = "warning" | "danger";

export type AttentionItem = {
  key: string;
  tone: AttentionTone;
  /** One or two words for the chip: "Expired", "Paused", "Failed". */
  chip: string;
  /** One plain sentence: what is wrong and what it costs. */
  text: string;
  action:
    | { kind: "link"; label: string; href: string }
    /** Expands the failure list in place. */
    | { kind: "failures"; label: string };
};

export type AttentionConnection = {
  kind: "instagram" | "facebook";
  name: string;
  status: "CONNECTED" | "DISCONNECTED" | "EXPIRED";
};

export type AttentionInput = {
  /** null while unknown: never claim "not connected" before the answer arrives. */
  connections: AttentionConnection[] | null;
  automations: Array<{ id: string; name: string; status: string }>;
  /** False while the automation list is loading or failed. */
  automationsKnown: boolean;
  failures: Array<{ updatedAt: string; lastError?: string; resultCode?: string }> | null;
  usage: { deliveriesThisMonth: number; monthlyDeliveryLimit: number | null } | null;
  now?: number;
};

/** What the outbound ledger records when the plan's monthly allowance blocks a send. */
export const MONTHLY_LIMIT_ERROR = "Monthly delivery limit reached";

/** A send the plan's monthly allowance stopped - not something Meta rejected. */
export function isMonthlyLimitBlock(failure: { lastError?: string; resultCode?: string }): boolean {
  return failure.lastError === MONTHLY_LIMIT_ERROR && (failure.resultCode === undefined || failure.resultCode === "SUPPRESSED");
}

/** First day of the next UTC month - when the delivery allowance resets. */
export function monthlyLimitResetsAt(now: number): Date {
  const current = new Date(now);
  return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
}

function resetDateLabel(now: number): string {
  return monthlyLimitResetsAt(now).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "UTC" });
}

function inCurrentPeriod(updatedAt: string, now: number): boolean {
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return false;
  const current = new Date(now);
  return time >= Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1) && time <= now + 60_000;
}

/** Failures older than this are history, not something to act on today. */
export const RECENT_FAILURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Plan use at or above this share is flagged before it runs out. */
export const USAGE_WARNING_RATIO = 0.8;

const SEVERITY: Record<AttentionTone, number> = { danger: 0, warning: 1 };

/**
 * When Meta blocked an account from sending, the refused send and every send
 * held after it record how long the pause had left, to the minute (see
 * accountPausedReason and accountSendHeldReason in meta/errors). Returns the
 * latest end still ahead of `now` and which platform it was, or null when no
 * pause is running.
 */
export function activeAccountPause(
  failures: AttentionInput["failures"],
  now: number,
): { until: number; platform: AccountPausePlatform } | null {
  let latest: { until: number; platform: AccountPausePlatform } | null = null;
  for (const failure of failures ?? []) {
    const pause = parseAccountPauseReason(failure.lastError);
    const recordedAt = Date.parse(failure.updatedAt);
    if (!pause || !Number.isFinite(recordedAt)) continue;
    const until = recordedAt + pause.durationMs;
    if (until > now && (!latest || until > latest.until)) latest = { until, platform: pause.platform };
  }
  return latest;
}

function count(value: number): string {
  return value.toLocaleString("en-IN");
}

function connectionName(connection: AttentionConnection): string {
  return connection.kind === "instagram" ? `@${connection.name.replace(/^@/, "")}` : connection.name;
}

export function deriveAttentionItems({ connections, automations, automationsKnown, failures, usage, now = Date.now() }: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const connection of connections ?? []) {
    if (connection.status === "CONNECTED") continue;
    const expired = connection.status === "EXPIRED";
    items.push({
      key: `connection:${connection.kind}:${connection.name}`,
      tone: "danger",
      chip: expired ? "Expired" : "Disconnected",
      text: `${connectionName(connection)} needs reconnecting. Nothing replies on it until you do.`,
      action: { kind: "link", label: "Reconnect", href: "/settings" },
    });
  }

  // A brand-new workspace gets the guided start instead; this is for one that
  // has automations with nowhere to send from.
  if (connections && connections.length === 0 && automationsKnown && automations.length > 0) {
    items.push({
      key: "connection:none",
      tone: "danger",
      chip: "Not connected",
      text: "Connect Instagram or a Facebook Page so your automations can reply.",
      action: { kind: "link", label: "Connect", href: "/settings" },
    });
  }

  // Meta limited an account: say so plainly, with when replies restart.
  const pause = activeAccountPause(failures, now);
  if (pause) {
    const restart = formatDateParts(new Date(pause.until), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const things = pause.platform === "Facebook" ? "Pages" : "accounts";
    items.push({
      key: "account-paused",
      tone: "danger",
      chip: "Limited",
      text: `${pause.platform} has limited one of your ${things}. Linkar paused its automatic replies until ${restart}.`,
      action: { kind: "link", label: "See activity", href: "/activity" },
    });
  }

  // A send already stopped by the plan this month means replies are paused,
  // even when the usage count has not caught up (or failed to load).
  const limitBlocked = (failures ?? []).some((failure) =>
    isMonthlyLimitBlock(failure) && inCurrentPeriod(failure.updatedAt, now));
  const limit = usage?.monthlyDeliveryLimit ?? null;
  const ratio = usage && limit && limit > 0 ? usage.deliveriesThisMonth / limit : 0;
  if (limitBlocked || ratio >= 1) {
    items.push({
      key: "usage",
      tone: "danger",
      chip: "Limit reached",
      text: `Monthly limit reached - replies are paused until ${resetDateLabel(now)} or you upgrade.`,
      action: { kind: "link", label: "Upgrade", href: "/settings?section=billing" },
    });
  } else if (usage && limit && ratio >= USAGE_WARNING_RATIO) {
    items.push({
      key: "usage",
      tone: "warning",
      chip: "Limit near",
      text: `${count(usage.deliveriesThisMonth)} of ${count(limit)} messages used this month (${Math.floor(ratio * 100)}%).`,
      action: { kind: "link", label: "See plans", href: "/settings?section=billing" },
    });
  }

  // Plan-limit blocks are covered by the item above; counting them here too
  // read as hundreds of Meta failures.
  const recentFailures = (failures ?? []).filter((failure) => {
    if (isMonthlyLimitBlock(failure)) return false;
    // Same for sends the running account pause already explains.
    if (pause && parseAccountPauseReason(failure.lastError)) return false;
    const time = Date.parse(failure.updatedAt);
    return Number.isFinite(time) && now - time <= RECENT_FAILURE_WINDOW_MS;
  });
  if (recentFailures.length > 0) {
    items.push({
      key: "failures",
      tone: "warning",
      chip: "Failed",
      text: recentFailures.length === 1
        ? "1 message couldn't be sent in the last 7 days."
        : `${count(recentFailures.length)} messages couldn't be sent in the last 7 days.`,
      action: { kind: "failures", label: "Review" },
    });
  }

  if (automationsKnown) {
    const paused = automations.filter((automation) => automation.status === "PAUSED");
    const active = automations.filter((automation) => automation.status === "ACTIVE");
    if (paused.length === 1) {
      items.push({
        key: "paused",
        tone: "warning",
        chip: "Paused",
        text: `${paused[0].name} is paused, so it isn't replying.`,
        action: { kind: "link", label: "Open", href: `/automations/${paused[0].id}/edit` },
      });
    } else if (paused.length > 1) {
      items.push({
        key: "paused",
        tone: "warning",
        chip: "Paused",
        text: `${count(paused.length)} automations are paused, so they aren't replying.`,
        action: { kind: "link", label: "Review", href: "/automations" },
      });
    } else if (automations.length > 0 && active.length === 0) {
      items.push({
        key: "none-on",
        tone: "warning",
        chip: "Off",
        text: automations.length === 1
          ? "Your automation is still a draft. Turn it on to start replying."
          : "Your automations are all drafts. Turn one on to start replying.",
        action: { kind: "link", label: "Open automations", href: "/automations" },
      });
    }
  }

  // Stable sort keeps the order above within a tone.
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => SEVERITY[left.item.tone] - SEVERITY[right.item.tone] || left.index - right.index)
    .map(({ item }) => item);
}
