import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * One quiet line standing in for a run of items that are all fine ("All 7
 * other settings ready"), with the full list one click away. Exceptions are
 * listed individually above it by the caller, so a problem never hides here.
 */
export function StatusSummary({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="status-summary">
      <summary>
        <span className="status-chip is-success">
          <span className="status-chip-dot" aria-hidden />
          {label}
        </span>
        <ChevronRight className="status-summary-chevron" size={16} aria-hidden />
      </summary>
      {children}
    </details>
  );
}

/** Splits a list into the items that need a look and the ones that are fine, keeping order. */
export function splitByStatus<T>(items: readonly T[], isNormal: (item: T) => boolean): { exceptions: T[]; normal: T[] } {
  const exceptions: T[] = [];
  const normal: T[] = [];
  for (const item of items) (isNormal(item) ? normal : exceptions).push(item);
  return { exceptions, normal };
}
