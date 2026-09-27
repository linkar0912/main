import type { ReactNode } from "react";
import { SectionCard } from "./page-header";
import { ReplyVolumeChart, type DayPoint } from "./reply-volume-chart";
import { DashboardChartSkeleton } from "./skeleton";

/**
 * The "Reply volume" card used by Home and Insights. One component so the
 * title, description, chart height, legend and empty/loading/error states are
 * identical everywhere it appears.
 */
export function ReplyVolumeCard({ sent, reached, days, loading = false, placeholder, action }: {
  sent: DayPoint[];
  reached: DayPoint[];
  days: number;
  loading?: boolean;
  /** Shown instead of the chart: an error with retry, or an empty state. */
  placeholder?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <SectionCard
      className="chart-panel"
      aria-label="Performance over time"
      title="Reply volume"
      description={`Replies sent and people reached per day, last ${days} days.`}
      action={action}
    >
      {placeholder ? placeholder : loading ? <DashboardChartSkeleton /> : <ReplyVolumeChart sent={sent} reached={reached} days={days} />}
    </SectionCard>
  );
}
