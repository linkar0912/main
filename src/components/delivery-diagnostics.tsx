"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { formatDateTime } from "@/src/lib/format-date";
import { attemptsLabel, DeliveryIssueRow, deliveryKindLabel } from "./delivery-issue-row";
import { relativeTimeLabel } from "./workspace-primitives";

export type DeliveryProblem = {
  kind: string;
  state: "FAILED" | "UNKNOWN";
  attemptCount: number;
  automationId?: string;
  broadcastId?: string;
  sequenceEnrollmentId?: string;
  lastError?: string;
  updatedAt: string;
};

const PREVIEW_COUNT = 3;

/** GET /api/automations/deliveries: recent messages that failed or are waiting on a retry. */
export async function requestDeliveryProblems(limit = 25, signal?: AbortSignal): Promise<DeliveryProblem[]> {
  const response = await fetch(`/api/automations/deliveries?limit=${limit}`, { signal });
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => null)) as { data?: DeliveryProblem[] } | null;
  return payload?.data ?? [];
}

/**
 * Recent delivery problems across the workspace. The Automations list already
 * loads them (they decide its "Needs attention" group), so it hands them in
 * through `problems` instead of a second request.
 */
export function DeliveryDiagnostics({ problems: provided }: { problems?: DeliveryProblem[] | null } = {}) {
  const [fetched, setProblems] = useState<DeliveryProblem[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const external = provided !== undefined;
  const problems = external ? provided : fetched;
  useEffect(() => {
    if (external) return;
    let cancelled = false;
    fetch("/api/automations/deliveries?limit=25")
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { data?: DeliveryProblem[] } | null) => {
        if (!cancelled) setProblems(payload?.data ?? []);
      })
      .catch(() => { if (!cancelled) setProblems([]); });
    return () => { cancelled = true; };
  }, [external]);

  if (!problems?.length) return null;
  const visible = showAll ? problems : problems.slice(0, PREVIEW_COUNT);
  return (
    <section className="surface" aria-label="Delivery issues">
      <div className="surface-head">
        <div className="surface-head-copy">
          <h2><AlertTriangle size={16} className="surface-head-icon is-warning" aria-hidden /> Delivery issues</h2>
          <p>{problems.length === 1 ? "1 recent message" : `${problems.length} recent messages`} need a look or are waiting to be retried.</p>
        </div>
      </div>
      <div className="surface-body">
      <ul className="failure-list">
        {visible.map((problem, index) => (
          <DeliveryIssueRow
            key={`${problem.kind}:${problem.updatedAt}:${index}`}
            label={deliveryKindLabel(problem.kind)}
            lastError={problem.lastError}
            detail={attemptsLabel(problem.attemptCount)}
            timestamp={problem.updatedAt}
            timeLabel={relativeTimeLabel(problem.updatedAt)}
            timeTitle={formatDateTime(problem.updatedAt)}
            state={problem.state}
            stateLabel={problem.state === "UNKNOWN" ? "Needs review" : "Retry pending"}
          />
        ))}
      </ul>
      {problems.length > PREVIEW_COUNT ? (
        <button className="list-toggle" type="button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show fewer" : `Show all ${problems.length}`}
        </button>
      ) : null}
      </div>
    </section>
  );
}
