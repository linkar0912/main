"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

type InsightsPayload = {
  usage?: { participantsThisMonth: number; monthlyLimit: number | null };
};

export function InsightsPanel({ automationId }: { automationId?: string }) {
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState("");
  const query = automationId ? `?automationId=${encodeURIComponent(automationId)}` : "";

  useEffect(() => {
    let active = true;
    fetch(`/api/insights${query}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as InsightsPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load insights");
        if (active) setInsights(payload);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load insights");
      });
    return () => {
      active = false;
    };
  }, [query]);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!insights) {
    return (
      <div className="empty-state">
        <div className="loading-line" />
        <div className="loading-line short" />
      </div>
    );
  }

  const usage = insights.usage;
  const usageLimit = usage?.monthlyLimit ?? null;
  const usagePercent =
    usage && usageLimit ? Math.min(100, Math.round((usage.participantsThisMonth / usageLimit) * 100)) : null;

  return (
    <div className="insights-stack side-stack">
      {usage && (
        <section className="panel side-panel" aria-label="Plan usage">
          <div className="panel-heading">
            <div><p className="eyebrow">Plan usage</p><h2>This month</h2></div>
          </div>
          <div className="usage-meter">
            {usagePercent !== null && usageLimit !== null && (
              <div
                className="usage-bar"
                role="progressbar"
                aria-label="Participants used this month"
                aria-valuenow={usage.participantsThisMonth}
                aria-valuemin={0}
                aria-valuemax={usageLimit}
              >
                <span style={{ width: `${Math.max(usagePercent, usage.participantsThisMonth > 0 ? 4 : 0)}%` }} />
              </div>
            )}
            <p className="muted usage-note">
              {usage.participantsThisMonth} participant{usage.participantsThisMonth === 1 ? "" : "s"} this month
              {usage.monthlyLimit ? ` of ${usage.monthlyLimit}` : ""} on the current plan.
            </p>
          </div>
        </section>
      )}

      <section className="panel side-panel" aria-label="Campaign export">
        <div className="panel-heading">
          <div><p className="eyebrow">Raw data</p><h2>Export</h2></div>
        </div>
        <a className="button button-secondary button-small" href={`/api/insights/export${query}`} download>
          <Download size={14} /> Export CSV
        </a>
        <p className="muted export-note">Every matched comment, delivery, and click for this campaign.</p>
      </section>
    </div>
  );
}

