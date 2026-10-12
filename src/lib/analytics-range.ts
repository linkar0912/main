/**
 * The trailing windows Home, Insights and an automation's Overview offer:
 * 7, 14 or 30 days (today included). The API accepts the same three
 * (`/api/insights?days=`), so this is the one list both sides agree on.
 */
export const ANALYTICS_RANGES = [7, 14, 30] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
export const DEFAULT_RANGE: AnalyticsRange = 14;

/** A URL or storage value as a range, or null when it isn't one we offer. */
export function parseRange(value: unknown): AnalyticsRange | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return ANALYTICS_RANGES.find((range) => range === number) ?? null;
}

/**
 * How many day labels the trend chart may show under a window: every day for
 * 7, every other day for 14 and every fifth day for 30 (TrendChart counts
 * back from today in equal steps, so 30 days at 6 labels lands on a 5-day
 * rhythm).
 */
export function chartLabelCount(days: number): number {
  return days > 14 ? 6 : 7;
}
