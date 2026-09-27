import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { DayPoint } from "./reply-volume-chart";
import { Skeleton } from "./skeleton";

export type StatDelta = { dir: "up" | "down" | "flat"; label: string; detail?: string };

function sumPoints(points: DayPoint[]): number {
  return points.reduce((total, point) => total + point.count, 0);
}

/** Second half of a daily series vs the first half (the prior week for 14 days). */
export function halfWindowDelta(points: DayPoint[]): StatDelta | null {
  if (points.length < 4) return null;
  const mid = Math.floor(points.length / 2);
  const recent = sumPoints(points.slice(mid));
  const previous = sumPoints(points.slice(0, mid));
  const detail = `vs the previous ${points.length - mid} days`;
  if (recent > 0 && previous === 0) return { dir: "up", label: "New", detail };
  if (previous === 0 || recent + previous === 0) return null;
  const pct = Math.round(((recent - previous) / previous) * 100);
  if (pct === 0) return { dir: "flat", label: "0%", detail };
  return pct > 0
    ? { dir: "up", label: `+${pct.toLocaleString()}%`, detail }
    : { dir: "down", label: `${pct.toLocaleString()}%`, detail };
}

function Delta({ delta }: { delta?: StatDelta | null }) {
  if (!delta) return null;
  const spoken = delta.dir === "flat" ? "No change" : `${delta.dir === "up" ? "Up" : "Down"} ${delta.label.replace(/^[+-]/, "")}`;
  return (
    <span
      className="stat-delta"
      data-dir={delta.dir}
      title={delta.detail}
      aria-label={delta.detail ? `${spoken} ${delta.detail}` : spoken}
    >
      {delta.dir === "up" ? <ArrowUpRight size={13} strokeWidth={2.4} aria-hidden /> : delta.dir === "down" ? <ArrowDownRight size={13} strokeWidth={2.4} aria-hidden /> : null}
      {delta.label}
    </span>
  );
}

/** Tiny area line of a daily series; decorative, the number carries the meaning. */
function Sparkline({ points }: { points: DayPoint[] }) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.count);
  const max = Math.max(...values, 1);
  const width = 96;
  const height = 28;
  const step = width / (values.length - 1);
  const coords = values.map((value, index) => [index * step, height - 2 - (value / max) * (height - 4)] as const);
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const [lastX, lastY] = coords[coords.length - 1];
  return (
    <svg className="stat-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden focusable="false">
      <path className="stat-spark-area" d={area} />
      <path className="stat-spark-line" d={line} vectorEffect="non-scaling-stroke" />
      <circle className="stat-spark-dot" cx={lastX} cy={lastY} r="2.4" />
    </svg>
  );
}

/** The strip of headline numbers at the top of Home, Insights and campaign pages. */
export function StatGrid({ label = "Performance summary", className = "", children }: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return <section className={`kpi-grid ${className}`.trim()} role="list" aria-label={label}>{children}</section>;
}

/** One headline number: label, value with trend, one-line note and optional sparkline. */
export function StatTile({ label, value, note, icon: Icon, delta, trend, loading = false }: {
  label: string;
  value: number | string;
  note: ReactNode;
  icon: LucideIcon;
  delta?: StatDelta | null;
  trend?: DayPoint[];
  loading?: boolean;
}) {
  return (
    <div className="kpi-tile stat-tile" role="listitem">
      <div className="stat-block" role="group" aria-label={label}>
        <span className="stat-head">
          <span className="stat-label"><span className="stat-icon"><Icon size={14} strokeWidth={2} aria-hidden /></span><span>{label}</span></span>
          {!loading ? <Delta delta={delta} /> : null}
        </span>
        <span className="stat-value-row">
          {loading ? <Skeleton className="kpi-skeleton" /> : <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>}
          {!loading && trend ? <Sparkline points={trend} /> : null}
        </span>
        <small className="stat-note">{note}</small>
      </div>
    </div>
  );
}
