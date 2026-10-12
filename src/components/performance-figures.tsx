"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useCountUp } from "./use-count-up";
import { changeSentence, periodChange } from "@/src/lib/insights-summary";

/**
 * One headline number on Home or Insights. Figures tied to a chart series
 * carry that series' swatch, so the numbers double as the chart's legend.
 * The value counts up once, the first time it is known.
 */
export function PerformanceFigure({ value, label, tone, change, note, delay = 0, suffix = "" }: {
  value: number | null;
  label: string;
  /**
   * primary / secondary: a chart series, with its swatch. plain: a key number
   * in the same row without a series. Omitted: the small right-hand aside.
   */
  tone?: "primary" | "secondary" | "plain";
  change?: ReactNode;
  note?: ReactNode;
  /** Milliseconds to wait before counting, to line up with the page's entrance. */
  delay?: number;
  /** Unit after the number, e.g. "%". */
  suffix?: string;
}) {
  const shown = useCountUp(value, { delay });
  const series = tone === "primary" || tone === "secondary";
  return (
    <div className={`perf-figure ${tone ? `is-${tone}` : "is-aside"}`} role="listitem">
      <span className="perf-figure-value">{shown === null ? "–" : `${shown.toLocaleString("en-IN")}${suffix}`}</span>
      <span className="perf-figure-label">{series ? <i className={`trend-swatch is-${tone}`} aria-hidden /> : null}{label}</span>
      {change ? <span className="perf-figure-change">{change}</span> : null}
      {note ? <span className="perf-figure-note">{note}</span> : null}
    </div>
  );
}

/** "Up 18% on the previous 14 days", with a direction arrow; nothing when there is nothing to compare. */
export function PeriodChangeNote({ current, previous, days }: { current: number; previous: number | undefined; days: number }) {
  if (previous === undefined) return null;
  const change = periodChange(current, previous);
  const sentence = changeSentence(change, days);
  if (!sentence) return null;
  const Icon = change.kind === "up" ? ArrowUpRight : change.kind === "down" ? ArrowDownRight : null;
  return <>{Icon ? <Icon size={14} strokeWidth={2.4} aria-hidden /> : null}{sentence}</>;
}
