export type StatusTone = "success" | "warning" | "danger" | "neutral";

/**
 * The one status treatment in the product: a coloured dot plus a plain word
 * ("Healthy", "Needs attention", "Down", "Paused"). The word carries the
 * meaning, so the state never depends on colour alone.
 */
export function StatusBadge({ tone, label, className = "" }: { tone: StatusTone; label: string; className?: string }) {
  return (
    <span className={`status-chip is-${tone} ${className}`.trim()}>
      <span className="status-chip-dot" aria-hidden />
      {label}
    </span>
  );
}
