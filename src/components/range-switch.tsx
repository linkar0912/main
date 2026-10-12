"use client";

import { slidingThumbRef } from "./ui/use-sliding-thumb";
import { ANALYTICS_RANGES, type AnalyticsRange } from "@/src/lib/analytics-range";

/**
 * "7 days · 14 days · 30 days": the segmented switch with the sliding ink
 * thumb that Home, Insights and an automation's Overview put beside their
 * numbers.
 */
export function RangeSwitch({ value, onChange, className = "", label = "Time range" }: {
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div ref={slidingThumbRef} className={`segmented range-switch ${className}`.trim()} role="group" aria-label={label}>
      {ANALYTICS_RANGES.map((option) => (
        <button
          key={option}
          type="button"
          className={`segmented-option ${value === option ? "is-on" : ""}`}
          aria-pressed={value === option}
          onClick={() => { if (option !== value) onChange(option); }}
        >
          {option} days
        </button>
      ))}
    </div>
  );
}
