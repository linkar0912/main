"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

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
        <span className="muted">Recent sends that need attention or are waiting for an automatic retry.</span>
      </div>
      <ul className="broadcast-list">
        {problems.map((problem, index) => (
          <li key={`${problem.kind}:${problem.updatedAt}:${index}`}>
            <div className="automation-copy">
              <div className="automation-title">
                <strong>{kindLabel(problem.kind)}</strong>
                <em className="sequence-status" data-status={problem.state}>
                  {problem.state === "UNKNOWN" ? "Needs review" : "Retry pending"}
                </em>
              </div>
              <p>{problem.lastError ?? "No provider detail was returned."}</p>
              <small className="muted">Attempt {problem.attemptCount} · {new Date(problem.updatedAt).toLocaleString()}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
