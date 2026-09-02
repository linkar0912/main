"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { InlineContentSkeleton } from "./skeleton";
import type { FlowDefinition } from "@/src/lib/automation/types";

type Version = {
  id: string;
  automationId: string;
  workspaceId: string;
  version: number;
  name: string;
  definition: FlowDefinition;
  snapshotBy?: string;
  snapshotAt: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function summarizeTrigger(definition: FlowDefinition): string {
  const trigger = definition.trigger;
  if (trigger.type === "comment") {
    const match = trigger.match === "any" ? "any comment" : trigger.keywords.join(", ");
    return `Comment matching ${match}`;
  }
  if (trigger.type === "message") {
    const match = trigger.match === "any" ? "any DM" : trigger.keywords.join(", ");
    return `DM matching ${match}`;
  }
  if (trigger.type === "referral") return "Referral tap";
  if (trigger.type === "optin") return "One-time notification opt-in";
  if (trigger.type === "first_contact") return "First-time contact";
  return "Story mention";
}

/** Standalone panel for the automation history list. Reusable from the row or the editor. */
export function AutomationVersionsPanel({ automationId, onRestored }: { automationId: string; onRestored?: () => void }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let cancelled = false;
    void (async () => {
      if (!cancelled) setLoading(true);
      try {
        const response = await fetch(`/api/automations/${automationId}/versions`);
        const payload = (await response.json().catch(() => ({}))) as { data?: Version[]; error?: string };
        if (cancelled) return;
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load history");
        if (!active) return;
        setVersions(payload.data);
      } catch (caught: unknown) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      active = false;
      cancelled = true;
    };
  }, [automationId]);

  async function restore(versionId: string) {
    if (!confirm("Restoring this version will overwrite the current flow. Continue?")) return;
    setRestoringId(versionId);
    setError("");
    try {
      const response = await fetch(`/api/automations/${automationId}/versions/${versionId}/restore`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not restore this version");
      onRestored?.();
      // Re-fetch the list so the new pre-restore snapshot is visible at the top.
      const refreshed = await fetch(`/api/automations/${automationId}/versions`);
      if (refreshed.ok) {
        const data = (await refreshed.json()) as { data?: Version[] };
        if (data.data) setVersions(data.data);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore this version");
    } finally {
      setRestoringId(null);
    }
  }

  if (loading) return <InlineContentSkeleton label="Loading automation history" rows={3} />;
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (versions.length === 0) {
    return (
      <p className="muted">
        <History size={14} /> No history yet. Every saved edit creates a new version you can restore.
      </p>
    );
  }
  return (
    <ol className="timeline-list" aria-label="Automation version history">
      {versions.map((version) => (
        <li key={version.id}>
          <div className="activity-row">
            <span>
              <strong>v{version.version}</strong> · {version.name}
            </span>
            <time dateTime={version.snapshotAt}>{formatDate(version.snapshotAt)}</time>
          </div>
          <p className="muted activity-summary">
            {summarizeTrigger(version.definition)}
            {version.snapshotBy ? ` · by ${version.snapshotBy}` : ""}
          </p>
          <button
            className="button button-secondary button-small"
            type="button"
            disabled={restoringId === version.id}
            onClick={() => void restore(version.id)}
          >
            {restoringId === version.id ? "Restoring…" : "Restore this version"}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Modal wrapper for the history panel. */
export function AutomationVersionsModal({ automationId, onClose, onRestored }: { automationId: string; onClose: () => void; onRestored?: () => void }) {
  return (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Automation history"
        onClick={(event) => event.stopPropagation()}
        style={{ padding: "var(--space-6)" }}
      >
        <div className="list-intro">
          <div>
            <p className="eyebrow">History</p>
            <h2>Automation versions</h2>
            <p className="muted">Each saved edit is a snapshot you can restore.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close history" onClick={onClose}>✕</button>
        </div>
        <AutomationVersionsPanel automationId={automationId} onRestored={onRestored} />
      </div>
    </div>
  );
}
