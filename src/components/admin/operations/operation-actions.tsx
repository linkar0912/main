"use client";

import { useLayoutEffect, useState } from "react";

import type { AdminOperationDetail } from "@/src/lib/admin/operations/types";
import { adminCommand, adminErrorMessage, downloadAdminFile } from "../shared/admin-request";
import { ReasonDialog } from "../shared/reason-dialog";
import { actionLabel } from "./labels";

const warning: Record<string, string> = {
  archive: "This takes it out of use without deleting its history.",
  delete: "This only works when nothing else depends on it.",
  retry: "Retry is blocked if Meta already confirmed this message.",
  reprocess: "The original event and its time are kept. Only complete stored events can be replayed, and replays are capped.",
  release_stale_claim: "This send stopped without a result from Meta. Releasing it marks the outcome unknown so it is never sent twice.",
  cancel_pending: "Only messages that have not been sent yet are cancelled.",
};

const destructiveActions = new Set(["delete", "archive", "cancel_pending", "suppress", "disable"]);

type CommandResult = { csv?: string; retried?: number; rejected?: number };

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
        ? `${data?.retried ?? 0} sends queued again; ${data?.rejected ?? 0} could not be retried yet.`
        : `Done: ${actionLabel(action)}.`);
    } catch (cause) {
      setError(adminErrorMessage(cause, action === "export_one" ? "Export unavailable" : "Operation failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3>What you can do</h3>
      {actions.length === 0 ? <p className="admin-hint">Nothing can be changed on this record right now.</p> : null}
      <div className="admin-actions">
        {actions.map((item) => (
          <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => { setAction(item); setError(null); }} key={item}>
            {actionLabel(item)}
          </button>
        ))}
      </div>
      {action ? (
        <ReasonDialog
          title={`${actionLabel(action)}: ${detail.title}`}
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
              <span>New link address</span>
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
