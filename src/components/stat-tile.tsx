import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { DayPoint } from "./reply-volume-chart";
import { Skeleton } from "./skeleton";

export type StatDelta = { dir: "up" | "down" | "flat"; label: string };

function sumPoints(points: DayPoint[]): number {
  return points.reduce((total, point) => total + point.count, 0);
}

/** Second half of a daily series vs the first half ("vs prior wk" for 14 days). */
export function halfWindowDelta(points: DayPoint[]): StatDelta | null {
  if (points.length < 4) return null;
  const mid = Math.floor(points.length / 2);
  const recent = sumPoints(points.slice(mid));
  const previous = sumPoints(points.slice(0, mid));
  if (recent > 0 && previous === 0) return { dir: "up", label: "new" };
  if (previous === 0 || recent + previous === 0) return null;
  const pct = Math.round(((recent - previous) / previous) * 100);
  if (pct === 0) return { dir: "flat", label: "0%" };
  return pct > 0
    ? { dir: "up", label: `+${pct}% vs prior wk` }
    : { dir: "down", label: `${pct}% vs prior wk` };
}

function DeltaPill({ delta }: { delta?: StatDelta | null }) {
  if (!delta) return null;
  return (
    <span className="delta-pill" data-dir={delta.dir === "flat" ? undefined : delta.dir}>
      {delta.dir === "up" ? <ArrowUpRight size={11} /> : delta.dir === "down" ? <ArrowDownRight size={11} /> : null}
      {delta.label}
    </span>
  );
}

/** The row of headline numbers at the top of Home, Insights and campaign pages. */
export function StatGrid({ label = "Performance summary", className = "", children }: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return <section className={`kpi-grid ${className}`.trim()} role="list" aria-label={label}>{children}</section>;
}

/** One headline number: icon + label, value (+ trend), one-line note. */
export function StatTile({ label, value, note, icon: Icon, delta, loading = false }: {
  label: string;
  value: number | string;
  note: ReactNode;
  icon: LucideIcon;
  delta?: StatDelta | null;
  loading?: boolean;
}) {
  return (
    <div className="kpi-tile stat-tile" role="listitem">
      <div className="stat-block" role="group" aria-label={label}>
        <span className="stat-label"><Icon size={15} strokeWidth={1.8} aria-hidden /><span>{label}</span></span>
        <span className="stat-value-row">
          {loading ? <Skeleton className="kpi-skeleton" /> : <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>}
          {!loading ? <DeltaPill delta={delta} /> : null}
        </span>
        <small className="stat-note">{note}</small>
      </div>
    </div>
  );
}
