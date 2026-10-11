"use client";

import { FormEvent, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { useAdminDialog } from "./use-admin-dialog";

/** Every audited command asks for a reason under this one label. */
export const REASON_LABEL = "Reason (saved to the audit log)";

export function ReasonDialog({
  title,
  intro,
  warning,
  wide = false,
  onCancel,
  onConfirm,
  busy,
  error,
  children,
  confirmDisabled = false,
  danger = false,
  confirmLabel = "Confirm",
}: {
  title: string;
  /** One plain sentence on what the action does, above any warning. */
  intro?: React.ReactNode;
  warning?: string;
  /** For dialogs that hold a form (plan and limits). */
  wide?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  busy: boolean;
  error?: string | null;
  children?: React.ReactNode;
  confirmDisabled?: boolean;
  danger?: boolean;
  confirmLabel?: string;
}) {
  const [reason, setReason] = useState("");
  const dialogRef = useAdminDialog<HTMLFormElement>(onCancel, busy);
  const ready = reason.trim().length >= 3;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!busy && !confirmDisabled && ready) onConfirm(reason.trim());
  }

  return (
    <div className="admin-dialog-backdrop" role="presentation">
      <form ref={dialogRef} tabIndex={-1} data-admin-confirmation="true" className={`admin-reason-dialog ${wide ? "is-wide" : ""}`.trim()} role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title" onSubmit={submit}>
        <h2 id="admin-dialog-title">{title}</h2>
        {intro ? <p className="admin-dialog-intro">{intro}</p> : null}
        {warning ? <p className={`admin-callout ${danger ? "is-danger" : ""}`}><TriangleAlert size={16} aria-hidden /><span>{warning}</span></p> : null}
        {error ? <div className="form-error admin-message" role="alert">{error}</div> : null}
        {children}
        <label className="field">
          <span>{REASON_LABEL}</span>
          <textarea required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className="admin-actions">
          <button className="button button-ghost" disabled={busy} type="button" onClick={onCancel}>Cancel</button>
          <button className={`button ${danger ? "button-danger" : "button-primary"}`} disabled={busy || confirmDisabled || !ready} type="submit">
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
