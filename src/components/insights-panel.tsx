"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { InlineContentSkeleton } from "./skeleton";

type InsightsPayload = {
  usage?: { participantsThisMonth: number; monthlyLimit: number | null };
};

export function InsightsPanel({ automationId }: { automationId?: string }) {
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState("");
  const query = automationId ? `?automationId=${encodeURIComponent(automationId)}` : "";

  useEffect(() => {
    let active = true;
    fetch(`/api/insights${query}${query ? "&" : "?"}include=usage`)
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
    return <InlineContentSkeleton label="Loading automation insights" rows={2} />;
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

      {automationId && <AbTestReport automationId={automationId} />}
    </div>
  );
}

type VariantRow = {
  variant: string;
  participants: number;
  delivered: number;
  clicked: number;
};

/** A/B opening-variant performance; hidden until at least two variants exist. */
function AbTestReport({ automationId }: { automationId: string }) {
  const [variants, setVariants] = useState<VariantRow[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/insights/ab-tests?automationId=${encodeURIComponent(automationId)}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: VariantRow[] };
        if (!response.ok) throw new Error("Could not load A/B results");
        if (active && payload.data && payload.data.length > 1) setVariants(payload.data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [automationId]);

  if (!variants) return null;
  const best = [...variants].sort((a, b) =>
    (b.delivered / Math.max(b.participants, 1)) - (a.delivered / Math.max(a.participants, 1)),
  )[0];

  return (
    <section className="panel side-panel" aria-label="A/B test results">
      <div className="panel-heading">
        <div><p className="eyebrow">A/B test</p><h2>Opening message</h2></div>
      </div>
      <ul className="variant-list">
        {variants.map((variant) => (
          <li key={variant.variant}>
            <span className={`tag-chip${variant.variant === best.variant ? " tag-chip-best" : ""}`}>Variant {variant.variant}</span>
            <span className="muted">
              {variant.participants} reached · {variant.delivered} delivered
              {variant.participants > 0 ? ` (${Math.round((variant.delivered / variant.participants) * 100)}%)` : ""}
              {variant.clicked > 0 ? ` · ${variant.clicked} clicks` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted export-note">Variant {best.variant} is converting best so far.</p>
    </section>
  );
}
