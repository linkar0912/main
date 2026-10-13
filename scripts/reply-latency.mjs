// Reply latency from worker logs: p50/p90/p99 per channel and event type.
//
//   docker logs linkar-worker --since 24h 2>&1 | node scripts/reply-latency.mjs
//   node scripts/reply-latency.mjs worker.log
//
// Reads the one "Realtime automation timing" JSON line the worker writes per
// realtime event (durations and counts only - no ids, text or tokens) and
// ignores everything else. firstReplyMs is webhook arrival -> Meta accepting
// the first message, the number the reply-speed goal is measured on.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TIMING_MESSAGE = "Realtime automation timing";
const FIELDS = [
  "firstReplyMs",
  "receivedToEnqueuedMs",
  "queueWaitMs",
  "preProviderMs",
  "databaseMs",
  "databaseRounds",
  "databaseCalls",
  "providerMs",
  "totalMs",
];

/** Nearest-rank percentile of an ascending array; null when empty. */
export function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/** Timing records from raw log text (one JSON object per line, other lines skipped). */
export function parseTimingLines(text) {
  const records = [];
  for (const line of text.split("\n")) {
    const start = line.indexOf("{");
    if (start < 0) continue;
    try {
      const record = JSON.parse(line.slice(start));
      if (record && record.message === TIMING_MESSAGE) records.push(record);
    } catch {
      // Not a JSON log line.
    }
  }
  return records;
}

/** Groups by channel + event type and returns { group: { count, field: { p50, p90, p99 } } }. */
export function summarizeReplyLatency(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.channel ?? "unknown"} ${record.eventType ?? "unknown"}${record.outcome === "failed" ? " (failed)" : ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const summary = {};
  for (const [key, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const entry = { count: group.length };
    for (const field of FIELDS) {
      const values = group.map((record) => record[field]).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
      if (values.length === 0) continue;
      entry[field] = { p50: percentile(values, 0.5), p90: percentile(values, 0.9), p99: percentile(values, 0.99) };
    }
    summary[key] = entry;
  }
  return summary;
}

function main() {
  const path = process.argv[2];
  const text = path ? readFileSync(path, "utf8") : readFileSync(0, "utf8");
  const summary = summarizeReplyLatency(parseTimingLines(text));
  if (Object.keys(summary).length === 0) {
    console.error(`No "${TIMING_MESSAGE}" lines found.`);
    process.exitCode = 1;
    return;
  }
  for (const [group, entry] of Object.entries(summary)) {
    console.log(`${group}  (${entry.count} events)`);
    for (const field of FIELDS) {
      const stats = entry[field];
      if (!stats) continue;
      console.log(`  ${field.padEnd(22)} p50 ${String(stats.p50).padStart(6)}  p90 ${String(stats.p90).padStart(6)}  p99 ${String(stats.p99).padStart(6)}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
