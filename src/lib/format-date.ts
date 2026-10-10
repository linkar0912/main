/**
 * Locale-fixed date formatting. `toLocaleDateString()`/`toLocaleString()`
 * without a locale resolve to the runtime's default locale, which differs
 * between the Node.js SSR process and the browser - producing a React
 * hydration mismatch (e.g. server "23/08/2026" vs client "8/23/2026") for
 * any date rendered from a server-passed prop.
 *
 * Every workspace date goes through here in en-IN, the same locale billing
 * uses for amounts and renewal dates, so one screen never mixes "Aug 23" and
 * "23 Aug".
 */
export const DATE_LOCALE = "en-IN";

function toDate(input: string | Date): Date {
  return typeof input === "string" ? new Date(input) : input;
}

/** "23 Aug 2026" */
export function formatDate(input: string | Date): string {
  return toDate(input).toLocaleDateString(DATE_LOCALE, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Compact "1 Sept" axis/tooltip label. Locale and time zone are pinned so a
 * UTC day key like "2026-09-01" renders identically on every machine
 * (see the locale note above).
 */
export function formatMonthDay(input: string | Date): string {
  return toDate(input).toLocaleDateString(DATE_LOCALE, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "23 Aug 2026, 3:35 pm" */
export function formatDateTime(input: string | Date): string {
  return toDate(input).toLocaleString(DATE_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Clock time in the viewer's zone: "3:35 pm". Client-rendered lists only. */
export function formatTime(input: string | Date): string {
  return toDate(input).toLocaleTimeString(DATE_LOCALE, { hour: "numeric", minute: "2-digit" });
}

/** Day and month in the viewer's zone: "1 Sept". Client-rendered lists only. */
export function formatShortDate(input: string | Date): string {
  return toDate(input).toLocaleDateString(DATE_LOCALE, { month: "short", day: "numeric" });
}

/**
 * Any other combination of fields, still in the shared locale. Prefer the
 * named helpers above; this exists for one-off labels such as weekday names.
 */
export function formatDateParts(input: string | Date, options: Intl.DateTimeFormatOptions): string {
  return toDate(input).toLocaleString(DATE_LOCALE, options);
}

/**
 * Compact "2h ago" style relative time. Only safe to call from code that
 * renders exclusively on the client (e.g. after a client-side fetch) -
 * `Date.now()` differs between server and client render passes, which
 * would otherwise produce a hydration mismatch.
 */
export function formatRelativeTime(input: string | Date): string {
  const date = toDate(input);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}
