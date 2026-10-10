"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { attemptsLabel, DeliveryIssueRow, deliveryKindLabel } from "./delivery-issue-row";
import { InlineContentSkeleton } from "./skeleton";
import { relativeTimeLabel } from "./workspace-primitives";
import { formatDateTime } from "@/src/lib/format-date";

type Failure = {
  id: string;
  kind: string;
  state: "FAILED";
  recipientId?: string;
  lastError?: string;
  attemptCount: number;
  updatedAt: string;
};

/**
 * Lists the most recent FAILED outbound deliveries so a workspace admin can
 * spot a misconfigured webhook, a token problem, or a recurring 5xx from Meta.
 */
export function FailurePanel({ limit }: { limit?: number } = {}) {
  const [showAll, setShowAll] = useState(false);
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
    return <InlineContentSkeleton label="Loading delivery failures" rows={3} />;
  }
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (failures.length === 0) {
    return (
      <p className="all-clear">
        <CheckCircle2 size={15} aria-hidden /> No failed deliveries in the recent window. Everything sent.
      </p>
    );
  }
  const visible = limit && !showAll ? failures.slice(0, limit) : failures;
  return (
    <>
    <ul className="failure-list" aria-label="Recent failed deliveries">
      {visible.map((failure) => (
        <DeliveryIssueRow
          key={failure.id}
          label={deliveryKindLabel(failure.kind)}
          lastError={failure.lastError}
          // Plain retry count; the Instagram-scoped person ID is noise here.
          detail={attemptsLabel(failure.attemptCount)}
          timestamp={failure.updatedAt}
          timeLabel={relativeTimeLabel(failure.updatedAt)}
          timeTitle={formatDateTime(failure.updatedAt)}
        />
      ))}
    </ul>
    {limit && failures.length > limit ? (
      <button className="list-toggle" type="button" onClick={() => setShowAll((value) => !value)}>
        {showAll ? "Show fewer" : `Show all ${failures.length}`}
      </button>
    ) : null}
    </>
  );
}
