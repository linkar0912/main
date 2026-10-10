"use client";

import { useState, type ReactNode } from "react";
import styles from "./proof-rail.module.css";

/**
 * The moving strip around the creator cards, with a visible pause control.
 * Hover and focus already pause it, but WCAG 2.2.2 asks for a control anyone
 * can use, including touch visitors who cannot hover. The cards themselves
 * stay server-rendered and arrive as children.
 */
export function ProofTicker({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);

  return (
    <div
      className={styles.ticker}
      data-proof-ticker
      data-ticker="continuous"
      data-pause-on-hover="true"
      data-pause-on-focus="true"
      data-paused={paused || undefined}
    >
      {children}
      <button
        type="button"
        className={styles.tickerToggle}
        aria-pressed={paused}
        aria-label={paused ? "Play creator examples" : "Pause creator examples"}
        onClick={() => setPaused((current) => !current)}
      >
        <span aria-hidden="true" data-icon={paused ? "play" : "pause"} />
      </button>
    </div>
  );
}
