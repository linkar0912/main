"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { History, X } from "lucide-react";
import { InlineConfirm } from "./inline-confirm";
import { RelativeTime } from "./ui/relative-time";
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

function summarizeTrigger(definition: FlowDefinition): string {
  const trigger = definition.trigger;
  if (trigger.type === "comment") {
    return trigger.match === "any" ? "Replies to any comment" : `Comment has ${trigger.keywords.join(", ")}`;
  }
  if (trigger.type === "message") {
    return trigger.match === "any" ? "Replies to any DM" : `DM has ${trigger.keywords.join(", ")}`;
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
  // Restoring replaces the live flow, so it asks first - in place, not in a
  // browser confirm box that looks like a different app.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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
    setRestoringId(versionId);
    setRestoreError("");
    try {
      const response = await fetch(`/api/automations/${automationId}/versions/${versionId}/restore`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not restore this version");
      setConfirmingId(null);
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
      <p className="all-clear is-neutral">
        <History size={15} aria-hidden /> No history yet. Every saved edit creates a version you can restore.
      </p>
    );
  }
  return (
    <>
    {restoreError ? <p className="form-error" role="alert">{restoreError}</p> : null}
    <ol className="version-list" aria-label="Automation version history">
      {versions.map((version, index) => {
        // Restoring brings back the saved on/off state too, so say so:
        // restoring a draft snapshot switches a live automation off.
        const state = version.status === "ACTIVE" ? "switched on" : version.status === "PAUSED" ? "paused" : "a draft (switched off)";
        const statusLabel = version.status === "ACTIVE" ? "Active" : version.status === "PAUSED" ? "Paused" : version.status === "DRAFT" ? "Draft" : "";
        return (
          <li className="version-item" key={version.id}>
            <div className="version-item-head">
              <strong className="version-number">v{version.version}</strong>
              {index === 0 ? <span className="version-latest">Latest</span> : null}
              <RelativeTime className="version-time" value={version.snapshotAt} />
            </div>
            <p className="version-name">{version.name}</p>
            <p className="version-summary">
              {statusLabel ? `${statusLabel}. ` : ""}{summarizeTrigger(version.definition)}
            </p>
            {version.snapshotBy ? <p className="version-by">Saved by {version.snapshotBy}</p> : null}
            {confirmingId === version.id ? (
              <InlineConfirm
                label={`Restore v${version.version}`}
                message={`This replaces the current flow, and the automation will be ${state}, as it was in v${version.version}.`}
                confirmLabel="Restore"
                busyLabel="Restoring…"
                busy={restoringId === version.id}
                onConfirm={() => void restore(version.id)}
                onCancel={() => setConfirmingId(null)}
              />
            ) : (
              <button
                className="button button-secondary button-small"
                type="button"
                disabled={restoringId !== null}
                onClick={() => { setRestoreError(""); setConfirmingId(version.id); }}
              >
                Restore this version
              </button>
            )}
          </li>
        );
      })}
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
        className="modal-panel versions-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Automation history"
        aria-describedby="versions-modal-lede"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="versions-modal-head">
          <div>
            <h2>Version history</h2>
            <p id="versions-modal-lede">Every saved edit is kept here. Restore one to bring it back.</p>
          </div>
          <button className="icon-button versions-modal-close" type="button" aria-label="Close history" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="versions-modal-body">
          <AutomationVersionsPanel automationId={automationId} onRestored={onRestored} />
        </div>
      </div>
    </div>,
  );
}

// Rendered on <body> so no page stacking context (the sticky mobile top bar,
// animated content slots, the automation row) can paint over the dialog.
function portal(node: ReactNode) {
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
