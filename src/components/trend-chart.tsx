"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { formatMonthDay } from "@/src/lib/format-date";
import type { DayPoint } from "@/src/lib/insights-summary";

export type TrendSeries = {
  key: string;
  /** Plural noun used in the tooltip and spoken readout: "replies sent". */
  label: string;
  points: DayPoint[];
  tone: "primary" | "secondary";
};

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 300;

function dayLabel(day: string): string {
  return formatMonthDay(`${day}T00:00:00Z`);
}

/** A 1-10 x 10^n step so the three gridlines land on round numbers without much headroom. */
export function niceScale(peak: number, ticks = 3): { max: number; step: number } {
  if (peak <= 0) return { max: ticks, step: 1 };
  const rough = peak / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = [1, 2, 3, 4, 5, 6, 8, 10].find((candidate) => normalized <= candidate) ?? 10;
  const step = Math.max(1, factor * magnitude);
  return { max: step * ticks, step };
}

/** Every series on one shared, sorted day axis (missing days read as zero). */
function alignSeries(series: readonly TrendSeries[]): { days: string[]; values: number[][] } {
  const days = [...new Set(series.flatMap((entry) => entry.points.map((point) => point.day)))].sort();
  const values = series.map((entry) => {
    const byDay = new Map<string, number>();
    for (const point of entry.points) byDay.set(point.day, (byDay.get(point.day) ?? 0) + point.count);
    return days.map((day) => byDay.get(day) ?? 0);
  });
  return { days, values };
}

/**
 * Monotone cubic through the points (Fritsch-Carlson), so the curve never
 * dips below zero or overshoots a peak the data doesn't have.
 */
function monotonePath(coords: Array<[number, number]>): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M${coords[0][0]},${coords[0][1]}`;
  const n = coords.length;
  const slopes: number[] = [];
  for (let index = 0; index < n - 1; index += 1) {
    const [x0, y0] = coords[index];
    const [x1, y1] = coords[index + 1];
    slopes.push((y1 - y0) / (x1 - x0));
  }
  const tangents: number[] = [slopes[0]];
  for (let index = 1; index < n - 1; index += 1) {
    const before = slopes[index - 1];
    const after = slopes[index];
    tangents.push(before * after <= 0 ? 0 : (3 * (before + after)) / ((2 * after + before) / before + (after + 2 * before) / after));
  }
  tangents.push(slopes[n - 2]);
  let path = `M${coords[0][0].toFixed(1)},${coords[0][1].toFixed(1)}`;
  for (let index = 0; index < n - 1; index += 1) {
    const [x0, y0] = coords[index];
    const [x1, y1] = coords[index + 1];
    const third = (x1 - x0) / 3;
    path += ` C${(x0 + third).toFixed(1)},${(y0 + tangents[index] * third).toFixed(1)} ${(x1 - third).toFixed(1)},${(y1 - tangents[index + 1] * third).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return path;
}

/**
 * Which day labels fit under the plot: today always, then every Nth day
 * back from it, so the gaps between labels are all the same number of days.
 */
export function labelIndexes(count: number, maxLabels: number): number[] {
  if (count <= maxLabels) return Array.from({ length: count }, (_, index) => index);
  const step = Math.ceil(count / maxLabels);
  const indexes: number[] = [];
  for (let index = count - 1; index >= 0; index -= step) indexes.unshift(index);
  return indexes;
}

/**
 * Daily trend lines for Home and Insights. The SVG stretches to any width;
 * everything that must stay crisp (labels, dots, tooltip) is HTML laid over
 * it by percentage. Readable by pointer (hover or touch-scrub) and keyboard
 * (focus the plot, then arrow keys), with each day announced politely.
 */
export function TrendChart({ series, label, animate = false, maxLabels = 7, className = "" }: {
  series: TrendSeries[];
  /** Accessible name of the plot, e.g. "Daily replies sent and people reached for the last 14 days". */
  label: string;
  /** Draw the lines in. Only true for the first render with data; refreshes never redraw. */
  animate?: boolean;
  maxLabels?: number;
  className?: string;
}) {
  const { days, values } = useMemo(() => alignSeries(series), [series]);
  const { max, step } = niceScale(Math.max(0, ...values.flat()));
  const [active, setActive] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const readoutId = useId();
  const count = days.length;

  const x = (index: number) => (count <= 1 ? VIEW_WIDTH / 2 : (index / (count - 1)) * VIEW_WIDTH);
  const y = (value: number) => VIEW_HEIGHT - (value / max) * VIEW_HEIGHT;
  const paths = values.map((row) => monotonePath(row.map((value, index) => [x(index), y(value)])));
  const ticks = [0, step, step * 2, max];

  function indexFromPointer(event: PointerEvent<HTMLDivElement>): number {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = box.width ? (event.clientX - box.left) / box.width : 0;
    return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count === 0) return;
    const current = active ?? count - 1;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(count - 1, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else if (event.key === "Escape") { setActive(null); return; }
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  const readout = active === null || !days[active]
    ? ""
    : `${dayLabel(days[active])}: ${series.map((entry, index) => `${values[index][active].toLocaleString("en-IN")} ${entry.label}`).join(", ")}`;
  const activeLeft = active === null ? 0 : (count <= 1 ? 50 : (active / (count - 1)) * 100);
  const tooltipAlign = activeLeft < 18 ? "start" : activeLeft > 82 ? "end" : "center";

  return (
    <div className={`trend-chart ${animate ? "is-drawing" : ""} ${className}`.trim()}>
      <div className="trend-axis" aria-hidden>
        {ticks.map((tick) => (
          <span key={tick} className="trend-tick" style={{ bottom: `${(tick / max) * 100}%` }}>{tick.toLocaleString("en-IN")}</span>
        ))}
      </div>
      <div
        ref={plotRef}
        className="trend-plot"
        role="group"
        tabIndex={0}
        aria-label={`${label}. Use the left and right arrow keys to read each day.`}
        aria-describedby={readoutId}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((current) => current ?? count - 1)}
        onBlur={() => setActive(null)}
        onPointerDown={(event) => setActive(indexFromPointer(event))}
        onPointerMove={(event) => { if (event.pointerType === "mouse" || event.buttons) setActive(indexFromPointer(event)); }}
        onPointerLeave={(event) => { if (event.pointerType === "mouse" && document.activeElement !== plotRef.current) setActive(null); }}
      >
        {ticks.map((tick) => (
          <span key={tick} className="trend-gridline" style={{ bottom: `${(tick / max) * 100}%` }} aria-hidden />
        ))}
        <svg className="trend-svg" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label} focusable="false">
          {series.map((entry, index) => entry.tone === "primary" && paths[index] ? (
            <path key={`${entry.key}-area`} className="trend-area" d={`${paths[index]} L${VIEW_WIDTH},${VIEW_HEIGHT} L0,${VIEW_HEIGHT} Z`} />
          ) : null)}
          {series.map((entry, index) => (
            <path key={entry.key} className={`trend-line is-${entry.tone}`} d={paths[index]} pathLength={1} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {active !== null ? (
          <>
            <span className="trend-guide" style={{ left: `${activeLeft}%` }} aria-hidden />
            {series.map((entry, index) => (
              <span
                key={entry.key}
                className={`trend-dot is-${entry.tone}`}
                style={{ left: `${activeLeft}%`, bottom: `${(values[index][active] / max) * 100}%` }}
                aria-hidden
              />
            ))}
            <div className="trend-tooltip" data-align={tooltipAlign} style={{ left: `${activeLeft}%` }} aria-hidden>
              <strong>{dayLabel(days[active])}</strong>
              {series.map((entry, index) => (
                <span key={entry.key}><i className={`trend-swatch is-${entry.tone}`} />{values[index][active].toLocaleString("en-IN")} {entry.label}</span>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <div className="trend-days" aria-hidden>
        {labelIndexes(count, maxLabels).map((index) => (
          <span key={days[index]} style={{ left: `${count <= 1 ? 50 : (index / (count - 1)) * 100}%` }}>{dayLabel(days[index])}</span>
        ))}
      </div>
      <p id={readoutId} className="sr-only" aria-live="polite">{readout}</p>
    </div>
  );
}
