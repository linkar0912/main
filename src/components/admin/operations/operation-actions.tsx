"use client";

import { useLayoutEffect, useState } from "react";

import type { AdminOperationDetail } from "@/src/lib/admin/operations/types";
import { adminCommand, adminErrorMessage, downloadAdminFile } from "../shared/admin-request";
import { ReasonDialog } from "../shared/reason-dialog";

const warning: Record<string, string> = {
  archive: "This removes the resource from active operation without deleting history.",
  delete: "This deletion is allowed only when linked history is absent.",
  retry: "Retry is blocked when a provider receipt already exists.",
  reprocess: "The original provider event ID and timestamp are preserved. Replay requires a complete stored event and is capped.",
  release_stale_claim: "An expired claim has an unknown provider outcome. Releasing it prevents an automatic resend.",
  cancel_pending: "Only work that has not been sent is cancelled.",
};
const destructiveActions = new Set(["delete", "archive", "cancel_pending", "suppress", "disable"]);

type CommandResult = { csv?: string; retried?: number; rejected?: number };

function label(action: string): string {
  return action.replaceAll("_", " ");
}

export function OperationActions({
  detail,
  onComplete,
  onPendingChange,
}: {
  detail: AdminOperationDetail;
  onComplete: (message: string) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [action, setAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState(String(detail.attributes.destination ?? ""));
  const [versionNumber, setVersionNumber] = useState("");

  useLayoutEffect(() => {
    onPendingChange?.(action !== null);
    return () => onPendingChange?.(false);
  }, [action, onPendingChange]);

  // "update" has no operator form here; editing happens in the workspace itself.
  const actions = detail.allowedActions.filter((item) => item !== "update");
  const restoreVersionInvalid = !Number.isInteger(Number(versionNumber)) || Number(versionNumber) < 1;

  async function execute(reason: string) {
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    try {
      const input = action === "update_destination"
        ? { destination }
        : action === "restore_version" ? { versionNumber: Number(versionNumber) } : {};
      const data = await adminCommand<CommandResult>(`/api/admin/operations/${detail.kind}/${detail.id}`, {
        method: "PATCH",
        body: { action, version: detail.version, input },
        reason,
        fallback: "operation_failed",
      });
      if (action === "export_one") {
        if (typeof data?.csv !== "string") throw new Error("export_unavailable");
        downloadAdminFile(new Blob([data.csv], { type: "text/csv;charset=utf-8" }), "linkar-contact.csv");
      }
      setAction(null);
      onComplete(action === "retry_failed"
        ? `${data?.retried ?? 0} recipients queued; ${data?.rejected ?? 0} rejected and remain retryable.`
        : `${label(action)} completed`);
    } catch (cause) {
      setError(adminErrorMessage(cause, action === "export_one" ? "Export unavailable" : "Operation failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3>Allowed actions</h3>
      {actions.length === 0 ? <p className="muted">No operator actions are available for this record in its current state.</p> : null}
      <div className="admin-command-actions">
        {actions.map((item) => (
          <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => { setAction(item); setError(null); }} key={item}>
            {label(item)}
          </button>
        ))}
      </div>
      {action ? (
        <ReasonDialog
          title={`${label(action)} ${detail.title}`}
          warning={warning[action]}
          error={error}
          busy={busy}
          danger={destructiveActions.has(action)}
          onCancel={() => { setAction(null); setError(null); }}
          onConfirm={execute}
          confirmDisabled={action === "restore_version" && restoreVersionInvalid}
        >
          {action === "update_destination" ? (
            <label className="field">
              <span>Destination URL</span>
              <input required type="url" maxLength={2048} value={destination} onChange={(event) => setDestination(event.target.value)} />
            </label>
          ) : null}
          {action === "restore_version" ? (
            <label className="field">
              <span>Version to restore</span>
              <input required type="number" min={1} step={1} value={versionNumber} onChange={(event) => setVersionNumber(event.target.value)} />
            </label>
          ) : null}
        </ReasonDialog>
      ) : null}
    </div>
  );
}
