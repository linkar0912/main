"use client";

/**
 * Local stand-ins for the shared primitives being built in src/components/ui/
 * (<RelativeTime value/>, <IdChip id/>). Same props, so swapping the import is
 * the whole migration once those land.
 */

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { formatDate, formatDateTime, formatTime } from "@/src/lib/format-date";

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

/** Relative time with the full local date and time on hover. */
export function LocalRelativeTime({ value, className }: { value: string | Date; className?: string }) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return (
    // The label depends on the viewer's clock and zone, so the server's
    // render is allowed to differ.
    <time className={className} dateTime={date.toISOString()} title={formatDateTime(date)} suppressHydrationWarning>
      {relativeTimeLabel(date)}
    </time>
  );
}

export type StatusTone = "success" | "warning" | "danger" | "neutral";

/** Status as a coloured dot and a plain word: "Active", "Paused", "Failed". */
export function LocalStatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="ws-status" data-tone={tone}>
      <span className="ws-status-dot" aria-hidden />
      {label}
    </span>
  );
}

/** Tone + word for the ACTIVE / PAUSED / DRAFT style enums the API returns. */
export function lifecycleStatus(status: string): { tone: StatusTone; label: string } {
  switch (status) {
    case "ACTIVE": return { tone: "success", label: "Active" };
    case "PAUSED": return { tone: "warning", label: "Paused" };
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

/** A demoted, copyable identifier: short mono form, full value on hover. */
export function LocalIdChip({ id, label = "ID" }: { id: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="ws-id-chip" title={id}>
      <code>{shortId(id)}</code>
      <button
        type="button"
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(id).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }).catch(() => undefined);
        }}
      >
        {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      </button>
    </span>
  );
}
