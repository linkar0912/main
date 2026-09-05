export type DayPoint = { day: string; count: number };

function formatDay(day: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${day}T00:00:00Z`));
}

function normalizeDayPoints(sent: DayPoint[], reached: DayPoint[]) {
  const byDay = new Map<string, { day: string; sent: number; reached: number }>();
  for (const point of sent) {
    const current = byDay.get(point.day) ?? { day: point.day, sent: 0, reached: 0 };
    current.sent += point.count;
    byDay.set(point.day, current);
  }
  for (const point of reached) {
    const current = byDay.get(point.day) ?? { day: point.day, sent: 0, reached: 0 };
    current.reached += point.count;
    byDay.set(point.day, current);
  }
  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day));
}

export function ReplyVolumeChart({
  sent,
  reached,
  days,
  compact = false,
}: {
  sent: DayPoint[];
  reached: DayPoint[];
  days: number;
  compact?: boolean;
}) {
  const points = normalizeDayPoints(sent, reached);
  const peak = Math.max(1, ...points.map((point) => point.sent), ...points.map((point) => point.reached));
  const hasActivity = points.some((point) => point.sent > 0 || point.reached > 0);
  const height = (count: number) => count ? Math.max(8, Math.round((count / peak) * 100)) : 2;

  return (
    <div className={`reply-volume-chart ${compact ? "is-compact" : ""}`}>
      <div className="insights-legend" aria-label="Chart legend">
        <span><i className="legend-swatch swatch-sent" /> Replies sent</span>
        <span><i className="legend-swatch swatch-participants" /> People reached</span>
      </div>
      {!hasActivity ? (
        <p className="chart-empty">No replies yet. Daily activity will appear here after an automation sends its first reply.</p>
      ) : (
        <div className="chart-plot">
          <div className="insights-chart" role="img" aria-label={`Daily replies sent and people reached for the last ${days} days`}>
            {points.map((point) => (
              <div className={point.sent || point.reached ? "chart-column" : "chart-column is-empty"} key={point.day} title={`${formatDay(point.day)}: ${point.sent} sent, ${point.reached} reached`}>
                <div className="chart-bars is-lg">
                  <span className="chart-bar bar-participants" style={{ height: `${height(point.reached)}%` }} />
                  <span className="chart-bar bar-sent" style={{ height: `${height(point.sent)}%` }} />
                </div>
                <small className="chart-date-label">{formatDay(point.day)}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
