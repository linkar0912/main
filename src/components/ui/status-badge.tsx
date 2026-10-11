"use client";

import { useState } from "react";

export type StatusTone = "success" | "warning" | "danger" | "neutral";

/**
 * The one status treatment in the product: a coloured dot plus a plain word
 * ("Healthy", "Needs attention", "Down", "Paused"). The word carries the
 * meaning, so the state never depends on colour alone.
 *
 * When the status changes on screen (not on first render) the badge re-mounts
 * with .is-changed, so the new word and dot fade in instead of the swap going
 * unnoticed.
 */
export function StatusBadge({ tone, label, className = "" }: { tone: StatusTone; label: string; className?: string }) {
  const [shown, setShown] = useState(label);
  const [changes, setChanges] = useState(0);
  if (label !== shown) {
    setShown(label);
    setChanges((count) => count + 1);
  }
  return (
    <span key={changes} className={`status-chip is-${tone}${changes ? " is-changed" : ""} ${className}`.trim()}>
      <span className="status-chip-dot" aria-hidden />
      {label}
    </span>
  );
}
