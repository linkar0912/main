"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

type Failure = {
  id: string;
  kind: string;
  state: "FAILED";
  recipientId?: string;
  lastError?: string;
  resultCode?: string;
  attemptCount: number;
  updatedAt: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function friendlyKind(kind: string): string {
  switch (kind) {
    case "CLASSIC_ACTION":
      return "Reply";
    case "EMAIL_CAPTURE":
      return "Email capture";
    case "CAMPAIGN_ACTION":
      return "Campaign";
    case "SEQUENCE_STEP":
      return "Sequence";
    case "BROADCAST_RECIPIENT":
      return "Broadcast";
    case "LEAD_EMAIL":
      return "Lead email";
    case "LEAD_WEBHOOK":
      return "Lead webhook";
    case "FLOW_FOLLOWUP":
      return "Follow-up";
    default:
      return kind;
  }
}

/**
 * Lists the most recent FAILED outbound deliveries so a workspace admin can
 * spot a misconfigured webhook, a token problem, or a recurring 5xx from Meta.
 */
export function FailurePanel() {
  const [failures, setFailures] = useState<Failure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let cancelled = false;
    void (async () => {
      if (!cancelled) setLoading(true);
      try {
        const response = await fetch("/api/insights/failures");
        const payload = (await response.json().catch(() => ({}))) as { data?: Failure[]; error?: string };
        if (cancelled) return;
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load failures");
        if (!active) return;
        setFailures(payload.data);
      } catch (caught: unknown) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load failures");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      active = false;
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="empty-state">
        <div className="loading-line" />
        <div className="loading-line short" />
      </div>
    );
  }
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (failures.length === 0) {
    return (
      <p className="muted">
        <AlertTriangle size={14} /> No failed deliveries in the recent window. You&apos;re all clear.
      </p>
    );
  }
  return (
    <ul className="failure-list" aria-label="Recent failed deliveries">
      {failures.map((failure) => (
        <li key={failure.id}>
          <div className="activity-row">
            <span>
              <span className="status-badge failure-badge">{friendlyKind(failure.kind)}</span>
              {failure.resultCode ? ` · ${failure.resultCode}` : ""}
            </span>
            <time dateTime={failure.updatedAt}>{formatDate(failure.updatedAt)}</time>
          </div>
          {failure.lastError && <p className="muted activity-summary">{failure.lastError}</p>}
          {failure.recipientId && <p className="muted activity-summary">recipient {failure.recipientId}</p>}
        </li>
      ))}
    </ul>
  );
}
