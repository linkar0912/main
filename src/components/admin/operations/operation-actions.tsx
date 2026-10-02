"use client";

import { useLayoutEffect, useState } from "react";
import type { AdminOperationDetail } from "@/src/lib/admin/operations/types";
import { ReasonDialog } from "../shared/reason-dialog";

const warning: Record<string, string> = {
  archive: "This removes the resource from active operation without deleting history.",
  delete: "This deletion is allowed only when linked history is absent.",
  retry: "Retry is blocked when a provider receipt already exists.",
  reprocess: "The original provider event ID and timestamp are preserved. Replay requires a complete stored event and is capped.",
  release_stale_claim: "An expired claim has an unknown provider outcome. Releasing it prevents an automatic resend.",
  cancel_pending: "Only work that has not been sent is cancelled.",
};

export function OperationActions({ detail, onComplete, onPendingChange }: { detail: AdminOperationDetail; onComplete: (message: string) => void; onPendingChange?: (pending: boolean) => void }) {
  const [action, setAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState(String(detail.attributes.destination ?? ""));
  const [versionNumber, setVersionNumber] = useState("");
  useLayoutEffect(() => { onPendingChange?.(action !== null); return () => onPendingChange?.(false); }, [action, onPendingChange]);

  async function execute(reason: string) {
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    try {
      const input = action === "update_destination" ? { destination } : action === "restore_version" ? { versionNumber: Number(versionNumber) } : {};
      const response = await fetch(`/api/admin/operations/${detail.kind}/${detail.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-admin-reason": reason, "idempotency-key": `admin-${crypto.randomUUID()}` },
        body: JSON.stringify({ action, version: detail.version, input }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; data?: { csv?: string; retried?: number; rejected?: number } };
      if (!response.ok) throw new Error(body.error ?? "operation_failed");
      if (action === "export_one") {
        if (typeof body.data?.csv !== "string") throw new Error("export_unavailable");
        const url = URL.createObjectURL(new Blob([body.data.csv], { type: "text/csv;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "linkar-contact.csv";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
      setAction(null);
      onComplete(action === "retry_failed" ? `${body.data?.retried ?? 0} recipients queued; ${body.data?.rejected ?? 0} rejected and remain retryable.` : `${action.replaceAll("_", " ")} completed`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Operation failed");
    } finally { setBusy(false); }
  }

  return <div><h3>Allowed actions</h3><div className="admin-command-actions">
    {detail.allowedActions.filter((item) => item !== "update").map((item) => <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => { setAction(item); setError(null); }} key={item}>{item.replaceAll("_", " ")}</button>)}
  </div>{action ? <ReasonDialog title={`${action.replaceAll("_", " ")} ${detail.title}`} warning={warning[action]} error={error} busy={busy} onCancel={() => setAction(null)} onConfirm={execute} confirmDisabled={action === "restore_version" && (!Number.isInteger(Number(versionNumber)) || Number(versionNumber) < 1)}>
    {action === "update_destination" ? <label className="field"><span>Destination URL</span><input required type="url" maxLength={2048} value={destination} onChange={(event) => setDestination(event.target.value)} /></label> : null}
    {action === "restore_version" ? <label className="field"><span>Version to restore</span><input required type="number" min={1} step={1} value={versionNumber} onChange={(event) => setVersionNumber(event.target.value)} /></label> : null}
  </ReasonDialog> : null}</div>;
}
