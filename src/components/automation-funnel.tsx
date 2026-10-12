import type { CSSProperties } from "react";
import { funnelDropSentence, type FunnelStep } from "@/src/lib/automation-analytics";

/**
 * A horizontal funnel: each step's count, a bar sized against the first
 * step, and the share of the step before that made it ("72% kept"). The
 * biggest leak is marked and put into one sentence underneath. On phones the
 * rows stack: label, count and share on one line, the bar under them.
 */
export function AutomationFunnel({ steps, label }: { steps: FunnelStep[]; label: string }) {
  const top = Math.max(1, steps[0]?.count ?? 0);
  const drop = funnelDropSentence(steps);
  const dropKey = drop ? worstStepKey(steps) : null;
  return (
    <>
      <ol className="auto-funnel" aria-label={label}>
        {steps.map((step, index) => (
          <li key={step.key} data-drop={dropKey === step.key ? "" : undefined} style={{ "--step": index } as CSSProperties}>
            <span className="auto-funnel-label">{step.label}</span>
            <span className="auto-funnel-bar" aria-hidden>
              <span style={{ width: `${step.count > 0 ? Math.max(1.5, (step.count / top) * 100) : 0}%` }} />
            </span>
            <strong className="auto-funnel-count">{step.count.toLocaleString("en-IN")}</strong>
            <small className="auto-funnel-kept">{step.kept === null ? "" : `${step.kept}% kept`}</small>
          </li>
        ))}
      </ol>
      {drop ? <p className="auto-funnel-hint">{drop}</p> : null}
    </>
  );
}

function worstStepKey(steps: readonly FunnelStep[]): string | null {
  let worst: FunnelStep | null = null;
  steps.forEach((step, index) => {
    if (index === 0 || step.kept === null || steps[index - 1].count < 10) return;
    if (!worst || step.kept < (worst.kept ?? 100)) worst = step;
  });
  return (worst as FunnelStep | null)?.key ?? null;
}
