"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, Pause, Pencil, Play, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "./status-badge";
import type { AutomationRecord, AutomationStatus } from "@/src/lib/repository";

async function requestAutomations(): Promise<AutomationRecord[]> {
  const response = await fetch("/api/automations");
  const payload = (await response.json()) as { data?: AutomationRecord[] };
  if (!response.ok) throw new Error("Could not load automations");
  return payload.data ?? [];
}

export function useAutomations() {
  const [automations, setAutomations] = useState<AutomationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void requestAutomations()
      .then((data) => {
        if (mounted) {
          setAutomations(data);
          setError("");
        }
      })
      .catch((caught: unknown) => {
        if (mounted) setError(caught instanceof Error ? caught.message : "Could not load automations");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  async function reload() {
    setLoading(true);
    try {
      const data = await requestAutomations();
      setAutomations(data);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load automations");
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(id: string, status: AutomationStatus) {
    const response = await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = (await response.json()) as { data?: AutomationRecord };
    if (!response.ok || !payload.data) throw new Error("Could not update automation");
    setAutomations((current) => current.map((automation) => automation.id === id ? payload.data as AutomationRecord : automation));
  }

  return { automations, loading, error, reload, setStatus };
}

function triggerSummary(automation: AutomationRecord): string {
  const trigger = automation.definition.trigger;
  if (trigger.type === "referral") return "Referral link tap";
  if (trigger.type === "optin") return "Opt-in tap";
  const source = trigger.type === "comment" ? "Comment" : "DM";
  const match = trigger.match === "any" ? "any message" : trigger.keywords.join(", ");
  return `${source} contains ${match || "a keyword"}`;
}

function actionSummary(automation: AutomationRecord): string {
  if (automation.definition.version !== 1) return "Follow-gated DM delivery";

  const action = automation.definition.actions[0];
  if (!action) return "No action configured";
  if (action.type === "private_reply") return "Private reply";
  if (action.type === "send_text") return "Send a DM";
  if (action.type === "send_link") return "Send a link";
  return "Send a button";
}

export function AutomationList({
  automations,
  loading,
  compact = false,
  onStatusChange,
}: {
  automations: AutomationRecord[];
  loading: boolean;
  compact?: boolean;
  onStatusChange: (id: string, status: AutomationStatus) => Promise<void>;
}) {
  if (loading) {
    return <div className="empty-state"><div className="loading-line" /><div className="loading-line short" /><div className="loading-line" /></div>;
  }
  if (automations.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon"><Workflow size={22} /></span>
        <h3>Your first automation starts here.</h3>
        <p>Turn one clear customer signal into one useful reply.</p>
        <Link className="button button-secondary" href="/automations/new">Create automation</Link>
      </div>
    );
  }

  const visible = compact ? automations.slice(0, 3) : automations;
  return (
    <div className={`automation-list ${compact ? "is-compact" : ""}`}>
      {visible.map((automation) => (
        <article className="automation-row" key={automation.id}>
          <div className="automation-icon"><Workflow size={19} strokeWidth={1.7} /></div>
          <div className="automation-copy">
            <div className="automation-title"><strong>{automation.name}</strong><StatusBadge status={automation.status} /></div>
            <p>{triggerSummary(automation)} <span className="row-divider">·</span> {actionSummary(automation)}</p>
          </div>
          {!compact && (
            <Link
              className="icon-button"
              href={`/automations/${automation.id}/edit`}
              aria-label={`Edit ${automation.name}`}
              title="Edit automation"
            >
              <Pencil size={16} />
            </Link>
          )}
          {!compact && automation.definition.version === 2 && (
            <Link
              className="icon-button"
              href={`/automations/${automation.id}/activity`}
              aria-label={`View activity for ${automation.name}`}
              title="View activity"
            >
              <Activity size={16} />
            </Link>
          )}
          {!compact && (
            <button
              className="icon-button"
              type="button"
              aria-label={`${automation.status === "ACTIVE" ? "Pause" : "Activate"} ${automation.name}`}
              title={automation.status === "ACTIVE" ? "Pause automation" : "Activate automation"}
              onClick={() => void onStatusChange(automation.id, automation.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}
            >
              {automation.status === "ACTIVE" ? <Pause size={16} /> : <Play size={16} />}
            </button>
          )}
          {compact && <Link className="row-link" href="/automations"><ArrowUpRight size={17} /></Link>}
        </article>
      ))}
      {compact && automations.length > visible.length && <Link className="list-more" href="/automations">View all {automations.length} automations <ArrowUpRight size={15} /></Link>}
    </div>
  );
}
