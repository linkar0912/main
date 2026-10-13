import { describe, expect, it } from "vitest";
import { parseTimingLines, percentile, summarizeReplyLatency } from "./reply-latency.mjs";

function timingLine(fields: Record<string, unknown>): string {
  return JSON.stringify({ channel: "instagram", eventType: "comment.created", outcome: "completed", ...fields, level: "info", message: "Realtime automation timing" });
}

describe("reply latency report", () => {
  it("uses nearest-rank percentiles", () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1_000];
    expect(percentile(values, 0.5)).toBe(500);
    expect(percentile(values, 0.9)).toBe(900);
    expect(percentile(values, 0.99)).toBe(1_000);
    expect(percentile([], 0.5)).toBeNull();
  });

  it("reads only the worker's timing lines, including ones prefixed by the log driver", () => {
    const text = [
      timingLine({ firstReplyMs: 900 }),
      `2026-10-13T10:00:00Z ${timingLine({ firstReplyMs: 1_100 })}`,
      JSON.stringify({ level: "info", message: "Processed queue job" }),
      "not json at all",
    ].join("\n");
    expect(parseTimingLines(text).map((record) => record.firstReplyMs)).toEqual([900, 1_100]);
  });

  it("groups by channel and event type and keeps failed jobs apart", () => {
    const records = parseTimingLines([
      timingLine({ firstReplyMs: 800, databaseRounds: 3 }),
      timingLine({ firstReplyMs: 1_200, databaseRounds: 3 }),
      timingLine({ eventType: "message.received", firstReplyMs: 700 }),
      timingLine({ outcome: "failed", totalMs: 50 }),
    ].join("\n"));

    expect(summarizeReplyLatency(records)).toEqual({
      "instagram comment.created": {
        count: 2,
        firstReplyMs: { p50: 800, p90: 1_200, p99: 1_200 },
        databaseRounds: { p50: 3, p90: 3, p99: 3 },
      },
      "instagram comment.created (failed)": { count: 1, totalMs: { p50: 50, p90: 50, p99: 50 } },
      "instagram message.received": { count: 1, firstReplyMs: { p50: 700, p90: 700, p99: 700 } },
    });
  });
});
