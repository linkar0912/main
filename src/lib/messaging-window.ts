import type { MessagingWindow } from "./repository";

/**
 * Quiet-hours helpers. Instagram does not expose a contact's timezone, so the window
 * is evaluated in the workspace timezone - good enough to avoid 3 a.m. blasts.
 */

// Constructing an Intl.DateTimeFormat is comparatively expensive and msUntilQuietEnd
// probes minute-by-minute, so formatters are built once per timezone. A timezone that
// Intl rejects caches as null and reads as "always on".
const hourFormatters = new Map<string, Intl.DateTimeFormat | null>();

function hourFormatter(timezone: string): Intl.DateTimeFormat | null {
  const cached = hourFormatters.get(timezone);
  if (cached !== undefined) return cached;
  let formatter: Intl.DateTimeFormat | null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone });
  } catch {
    formatter = null; // invalid IANA timezone → treat as always-on
  }
  hourFormatters.set(timezone, formatter);
  return formatter;
}

export function localHour(now: Date, timezone: string): number | undefined {
  const formatter = hourFormatter(timezone);
  if (!formatter) return undefined;
  // Some implementations render midnight as "24" under hour12:false.
  return Number(formatter.format(now)) % 24;
}

export function isQuietNow(now: Date, window: MessagingWindow): boolean {
  const hour = localHour(now, window.timezone);
  if (hour === undefined) return false;
  if (window.startHour === window.endHour) return false; // zero-length window = always on
  return window.startHour < window.endHour
    ? hour >= window.startHour && hour < window.endHour
    : hour >= window.startHour || hour < window.endHour;
}

/**
 * Milliseconds until the quiet window actually closes, or 0 when it is already open.
 *
 * Probed minute-by-minute rather than hourly: callers such as the broadcast fan-out
 * turn this into a fixed BullMQ delay and never re-check, so an estimate that lands
 * even a minute early would deliver inside the quiet window.
 */
export function msUntilQuietEnd(now: Date, window: MessagingWindow): number {
  if (!isQuietNow(now, window)) return 0;
  const probe = new Date(now.getTime());
  const horizonMinutes = 48 * 60;
  for (let minutes = 1; minutes <= horizonMinutes; minutes += 1) {
    probe.setTime(now.getTime() + minutes * 60_000);
    if (!isQuietNow(probe, window)) return minutes * 60_000;
  }
  return horizonMinutes * 60_000;
}

/**
 * Narrows the three nullable quiet-hours columns into a window.
 *
 * Hour 0 is a legitimate boundary (a "00:00 -> 08:00" window is ordinary), so every
 * column is compared against null/undefined explicitly - a truthiness check would
 * silently discard midnight and disable quiet hours for that workspace.
 */
export function toMessagingWindow(
  row:
    | { quietStartHour?: number | null; quietEndHour?: number | null; timezone?: string | null }
    | null
    | undefined,
): MessagingWindow | null {
  if (!row) return null;
  const { quietStartHour, quietEndHour, timezone } = row;
  if (quietStartHour === null || quietStartHour === undefined) return null;
  if (quietEndHour === null || quietEndHour === undefined) return null;
  if (!timezone) return null;
  return { startHour: quietStartHour, endHour: quietEndHour, timezone };
}

/**
 * Meta's standard messaging window: an automated DM is only deliverable within
 * 24 hours of the person's last inbound message. Sending outside it - without
 * one of Meta's approved message tags, which Linkar does not use anywhere - is
 * a Platform Policy violation and is the single fastest way to get a connected
 * professional account rate-limited, restricted, or banned.
 *
 * This is distinct from the quiet-hours window above: quiet hours are a
 * courtesy the workspace owner configures, this one is a hard platform rule.
 * Every DM-side send path must gate on it, so the constant and the predicate
 * live here rather than being re-declared per runner.
 */
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1_000;

/**
 * True when a DM to this contact is still inside Meta's 24-hour window.
 *
 * A missing or unparseable timestamp reads as "closed" on purpose: we cannot
 * prove an inbound message opened the window, and guessing in the permissive
 * direction is what risks the account.
 */
export function isWithinMessagingWindow(
  lastInboundAtIso: string | undefined,
  now: number = Date.now(),
): boolean {
  const lastInboundMs = lastInboundAtIso ? Date.parse(lastInboundAtIso) : Number.NaN;
  return Number.isFinite(lastInboundMs) && now < lastInboundMs + MESSAGING_WINDOW_MS;
}
