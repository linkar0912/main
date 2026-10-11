"use client";

/**
 * Workspace-screen helpers. The Local* components are thin wrappers over the
 * shared primitives in src/components/ui/ so the app and the owner console
 * render statuses, IDs and times identically.
 */

import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import { StatusBadge } from "@/src/components/ui/status-badge";
import { formatDate, formatTime } from "@/src/lib/format-date";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/**
 * "Just now", "5 minutes ago", "3 hours ago", "Yesterday, 9:19 pm",
 * "4 days ago", then a plain date. Future times read "In 2 hours" /
 * "Tomorrow, 9:00 am". Viewer's local zone throughout.
 */
export function relativeTimeLabel(input: string | Date, now: number = Date.now()): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const time = date.getTime();
  if (Number.isNaN(time)) return "";
  const diff = now - time;
  const dayDelta = Math.round((startOfDay(new Date(now)) - startOfDay(date)) / DAY);

  if (diff >= 0) {
    if (diff < MINUTE) return "Just now";
    if (diff < HOUR) return `${plural(Math.floor(diff / MINUTE), "minute")} ago`;
    if (dayDelta === 0) return `${plural(Math.floor(diff / HOUR), "hour")} ago`;
    if (dayDelta === 1) return `Yesterday, ${formatTime(date)}`;
    if (dayDelta < 7) return `${dayDelta} days ago`;
    return formatDate(date);
  }
  const ahead = -diff;
  if (ahead < HOUR) return `In ${plural(Math.max(1, Math.round(ahead / MINUTE)), "minute")}`;
  if (dayDelta === 0) return `In ${plural(Math.round(ahead / HOUR), "hour")}`;
  if (dayDelta === -1) return `Tomorrow, ${formatTime(date)}`;
  if (dayDelta > -7) return `In ${-dayDelta} days`;
  return formatDate(date);
}

/** Relative time with the full local date and time on hover (shared component). */
export function LocalRelativeTime({ value, className }: { value: string | Date; className?: string }) {
  return <RelativeTime value={value} className={className} />;
}

export type StatusTone = "success" | "warning" | "danger" | "neutral";

/** Status as a coloured dot and a plain word (shared component). */
export function LocalStatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return <StatusBadge tone={tone} label={label} />;
}

/** Tone + word for the ACTIVE / PAUSED / DRAFT style enums the API returns. */
export function lifecycleStatus(status: string): { tone: StatusTone; label: string } {
  switch (status) {
    case "ACTIVE": return { tone: "success", label: "Active" };
    case "PAUSED": return { tone: "neutral", label: "Paused" };
    case "DRAFT": return { tone: "neutral", label: "Draft" };
    case "FAILED": return { tone: "danger", label: "Failed" };
    case "CONNECTED": return { tone: "success", label: "Connected" };
    case "EXPIRED": return { tone: "danger", label: "Expired" };
    case "REVOKED": return { tone: "danger", label: "Disconnected" };
    default: return { tone: "neutral", label: status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ") };
  }
}

/** "automation_6c67…" -> "6c67ab12…9f3e": prefix stripped, first 8 + last 4. */
export function shortId(id: string): string {
  const bare = id.replace(/^[a-z]+(?:_[a-z]+)*_(?=[0-9a-z-]{8,}$)/i, "");
  return bare.length > 14 ? `${bare.slice(0, 8)}…${bare.slice(-4)}` : bare;
}

/** A demoted, copyable identifier (shared component). */
export function LocalIdChip({ id }: { id: string; label?: string }) {
  return <IdChip id={id} />;
}
