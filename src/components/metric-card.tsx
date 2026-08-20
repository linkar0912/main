import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, note, icon: Icon, tone = "saffron" }: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: "saffron" | "mint" | "lavender";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-top"><span>{label}</span><Icon size={19} strokeWidth={1.7} /></div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
