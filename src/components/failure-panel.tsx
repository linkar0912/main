"use client";

import { CheckCircle2, RefreshCw } from "lucide-react";
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
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    let cancelled = false;
    void (async () => {
      if (!cancelled) {
        setLoading(true);
        setError("");
      }
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
  }, [reloadKey]);

  if (loading) {
    return <InlineContentSkeleton label="Loading delivery failures" rows={3} />;
  }
  if (error) {
    return (
      <div className="panel-state" role="alert">
        <p>Recent failures didn’t load. Check your connection and try again.</p>
        <button className="button button-secondary button-small" type="button" onClick={() => setReloadKey((key) => key + 1)}>
          <RefreshCw size={15} aria-hidden /> Try again
        </button>
      </div>
    );
  }
  if (failures.length === 0) {
    // "Everything sent" was a claim a brand-new workspace (nothing sent yet)
    // could not back up; "nothing failed" is true either way.
    return (
      <p className="all-clear">
        <CheckCircle2 size={15} aria-hidden /> No failed deliveries recently. Nothing needs a look.
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
