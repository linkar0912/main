"use client";

import { useSyncExternalStore } from "react";

import { DATE_LOCALE } from "@/src/lib/format-date";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TICK_MS = 30_000;

function toDate(value: string | Date | number): Date {
  return value instanceof Date ? value : new Date(value);
}

function clock(date: Date): string {
  return date.toLocaleTimeString(DATE_LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/**
 * Reads like a person would say it, in the viewer's own time zone:
 * "Just now", "12 minutes ago", "3 hours ago", "Yesterday 21:19", "Mon 09:05",
 * "3 Oct, 21:19", "3 Oct 2025". Future times read "in 20 minutes",
 * "Today 18:00", "Tomorrow 10:00", "Fri 10:00".
 */
export function relativeTimeLabel(value: string | Date | number, now: number): string {
  const date = toDate(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return "Unknown";
  const delta = now - time;
  const dayOffset = Math.round((startOfDay(time) - startOfDay(now)) / DAY);

  if (Math.abs(delta) < MINUTE) return "Just now";
  if (delta > 0) {
    if (delta < HOUR) return `${plural(Math.floor(delta / MINUTE), "minute")} ago`;
    if (dayOffset === 0 && delta < 12 * HOUR) return `${plural(Math.floor(delta / HOUR), "hour")} ago`;
  } else if (-delta < HOUR) {
    return `in ${plural(Math.ceil(-delta / MINUTE), "minute")}`;
  }
  if (dayOffset === 0) return `Today ${clock(date)}`;
  if (dayOffset === -1) return `Yesterday ${clock(date)}`;
  if (dayOffset === 1) return `Tomorrow ${clock(date)}`;
  if (Math.abs(dayOffset) < 7) return `${date.toLocaleDateString(DATE_LOCALE, { weekday: "short" })} ${clock(date)}`;
  if (date.getFullYear() === new Date(now).getFullYear()) {
    return `${date.toLocaleDateString(DATE_LOCALE, { day: "numeric", month: "short" })}, ${clock(date)}`;
  }
  return date.toLocaleDateString(DATE_LOCALE, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The exact moment in the viewer's own time zone, for the tooltip:
 * "11 Oct 2026, 9:19:45 pm". No zone name - it is always the viewer's local
 * time, and a zone label ("UTC", "GMT+5:30") reads as server jargon.
 */
export function fullTimeLabel(value: string | Date | number): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(DATE_LOCALE, { dateStyle: "medium", timeStyle: "medium" });
}

function subscribe(onTick: () => void): () => void {
  const timer = window.setInterval(onTick, TICK_MS);
  return () => window.clearInterval(timer);
}
// Rounded so repeated reads within one tick return the same snapshot.
const clientNow = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const serverNow = () => null;

/**
 * A relative, local time with the full date-time in its tooltip. The server
 * (and the hydration pass) render a time-zone-neutral date so markup matches;
 * the relative wording replaces it as soon as the page is interactive.
 */
export function RelativeTime({ value, fallback = "Never", inline = false, className }: {
  value: string | Date | number | null | undefined;
  fallback?: string;
  /** Mid-sentence ("Created just now"): lowercases "Just now", "Today", "Yesterday", "Tomorrow". */
  inline?: boolean;
  className?: string;
}) {
  const now = useSyncExternalStore(subscribe, clientNow, serverNow);
  if (value === null || value === undefined || value === "") return <span className={className}>{fallback}</span>;
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return <span className={className}>{fallback}</span>;
  const iso = date.toISOString();
  if (now === null) {
    return (
      <time className={className} dateTime={iso}>
        {date.toLocaleDateString(DATE_LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
      </time>
    );
  }
  const label = relativeTimeLabel(date, now);
  const shown = inline && /^(Just|Today|Yesterday|Tomorrow)\b/.test(label) ? `${label[0].toLowerCase()}${label.slice(1)}` : label;
  return <time className={className} dateTime={iso} title={fullTimeLabel(date)}>{shown}</time>;
}
