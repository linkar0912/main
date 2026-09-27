"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { formatDateTime } from "@/src/lib/format-date";
import { DeliveryIssueRow } from "./delivery-issue-row";

type DeliveryProblem = {
  kind: string;
  state: "FAILED" | "UNKNOWN";
  attemptCount: number;
  automationId?: string;
  broadcastId?: string;
  sequenceEnrollmentId?: string;
  lastError?: string;
  updatedAt: string;
};

function kindLabel(kind: string): string {
  return kind.toLowerCase().split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

const PREVIEW_COUNT = 3;

export function DeliveryDiagnostics() {
  const [problems, setProblems] = useState<DeliveryProblem[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/automations/deliveries?limit=25")
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { data?: DeliveryProblem[] } | null) => {
        if (!cancelled) setProblems(payload?.data ?? []);
      })
      .catch(() => { if (!cancelled) setProblems([]); });
    return () => { cancelled = true; };
  }, []);

  if (!problems?.length) return null;
  const visible = showAll ? problems : problems.slice(0, PREVIEW_COUNT);
  return (
    <section className="surface" aria-label="Delivery issues">
      <div className="surface-head">
        <div className="surface-head-copy">
          <h2><AlertTriangle size={16} className="surface-head-icon is-warning" /> Delivery issues <span className="count-badge">{problems.length}</span></h2>
          <p>Recent sends that need attention or are waiting for an automatic retry.</p>
        </div>
      </div>
      <div className="surface-body">
      <ul className="failure-list">
        {visible.map((problem, index) => (
          <DeliveryIssueRow
            key={`${problem.kind}:${problem.updatedAt}:${index}`}
            label={kindLabel(problem.kind)}
            lastError={problem.lastError}
            detail={`Attempt ${problem.attemptCount}`}
            timestamp={problem.updatedAt}
            timeLabel={formatDateTime(problem.updatedAt)}
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
