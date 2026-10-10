"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { History, X } from "lucide-react";
import { useFocusTrap } from "./use-focus-trap";
import { InlineContentSkeleton } from "./skeleton";
import type { FlowDefinition } from "@/src/lib/automation/types";

type Version = {
  id: string;
  automationId: string;
  workspaceId: string;
  version: number;
  name: string;
  definition: FlowDefinition;
  status?: "DRAFT" | "ACTIVE" | "PAUSED";
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
  // Kept apart from the load error: a failed restore must not replace the list
  // the person was just looking at.
  const [restoreError, setRestoreError] = useState("");
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
    // Restoring brings back the saved on/off state too, so say so: restoring a
    // draft snapshot switches a live automation off.
    const target = versions.find((version) => version.id === versionId);
    const state = target?.status === "ACTIVE" ? "switched on" : target?.status === "PAUSED" ? "paused" : "a draft (switched off)";
    if (!confirm(`Restore v${target?.version ?? ""}? It replaces the current flow and the automation will be ${state}, as it was in that version.`)) return;
    setRestoringId(versionId);
    setRestoreError("");
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
      setRestoreError(caught instanceof Error ? caught.message : "Could not restore this version");
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
    <>
    {restoreError ? <p className="form-error" role="alert">{restoreError}</p> : null}
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
            {version.status ? `${version.status === "ACTIVE" ? "Active" : version.status === "PAUSED" ? "Paused" : "Draft"} · ` : ""}
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
    </>
  );
}

/** Modal wrapper for the history panel. */
export function AutomationVersionsModal({ automationId, onClose, onRestored }: { automationId: string; onClose: () => void; onRestored?: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { onEscape: onClose });

  return portal(
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
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
          <button className="icon-button" type="button" aria-label="Close history" onClick={onClose}><X size={16} /></button>
        </div>
        <AutomationVersionsPanel automationId={automationId} onRestored={onRestored} />
      </div>
    </div>,
  );
}

// Rendered on <body> so no page stacking context (the sticky mobile top bar,
// animated content slots, the automation row) can paint over the dialog.
function portal(node: ReactNode) {
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
