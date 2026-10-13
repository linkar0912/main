export type ReplyTimingRecord = Record<string, unknown> & {
  message: "Realtime automation timing";
  channel?: string;
  eventType?: string;
  outcome?: string;
};

export type PercentileSummary = { p50: number | null; p90: number | null; p99: number | null };

export function percentile(sorted: number[], fraction: number): number | null;
export function parseTimingLines(text: string): ReplyTimingRecord[];
export function summarizeReplyLatency(
  records: ReplyTimingRecord[],
): Record<string, { count: number } & Partial<Record<string, PercentileSummary>>>;
