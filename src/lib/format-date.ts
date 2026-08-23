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
