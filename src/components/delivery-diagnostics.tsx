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

export function DeliveryDiagnostics() {
  const [problems, setProblems] = useState<DeliveryProblem[] | null>(null);
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
  return (
    <section className="panel full-list-panel" aria-label="Delivery issues">
      <div className="list-intro">
        <div className="list-count"><AlertTriangle size={17} /><span>Delivery issues</span></div>
      </div>
      <p className="muted">Recent sends that need attention or are waiting for an automatic retry.</p>
      <ul className="failure-list">
        {problems.map((problem, index) => (
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
    </section>
  );
}
