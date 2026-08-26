/**
 * Locale-fixed date formatting. `toLocaleDateString()`/`toLocaleString()`
 * without a locale resolve to the runtime's default locale, which differs
 * between the Node.js SSR process and the browser - producing a React
 * hydration mismatch (e.g. server "23/08/2026" vs client "8/23/2026") for
 * any date rendered from a server-passed prop.
 */
export function formatDate(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Compact "2h ago" style relative time. Only safe to call from code that
 * renders exclusively on the client (e.g. after a client-side fetch) -
 * `Date.now()` differs between server and client render passes, which
 * would otherwise produce a hydration mismatch.
 */
export function formatRelativeTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
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
