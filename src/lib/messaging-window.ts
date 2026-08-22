import type { MessagingWindow } from "./repository";

/**
 * Quiet-hours helpers. Instagram does not expose a contact's timezone, so the window
 * is evaluated in the workspace timezone — good enough to avoid 3 a.m. blasts.
 */
export function localHour(now: Date, timezone: string): number | undefined {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone });
    return Number(formatter.format(now)) % 24;
  } catch {
    return undefined; // invalid IANA timezone → treat as always-on
  }
}

export function isQuietNow(now: Date, window: MessagingWindow): boolean {
  const hour = localHour(now, window.timezone);
  if (hour === undefined) return false;
  if (window.startHour === window.endHour) return false; // zero-length window = always on
  return window.startHour < window.endHour
    ? hour >= window.startHour && hour < window.endHour
    : hour >= window.startHour || hour < window.endHour;
}

/** Milliseconds until the quiet window ends (checked hour-by-hour, capped at 48h). */
export function msUntilQuietEnd(now: Date, window: MessagingWindow): number {
  const probe = new Date(now.getTime());
  for (let minutes = 60; minutes <= 48 * 60; minutes += 60) {
    probe.setTime(now.getTime() + minutes * 60_000);
    if (!isQuietNow(probe, window)) {
      // Back up to the boundary minute for a tidy resume time.
      return Math.max(60_000, minutes * 60_000 - 59 * 60_000);
    }
  }
  return 60_000;
}
