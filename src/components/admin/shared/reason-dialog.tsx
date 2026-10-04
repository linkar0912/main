"use client";

import { FormEvent, useState } from "react";

import { useAdminDialog } from "./use-admin-dialog";

export function ReasonDialog({
  title,
  warning,
  onCancel,
  onConfirm,
  busy,
  error,
  children,
  confirmDisabled = false,
  danger = false,
}: {
  title: string;
  warning?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  busy: boolean;
  error?: string | null;
  children?: React.ReactNode;
  confirmDisabled?: boolean;
  danger?: boolean;
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
      <form ref={dialogRef} tabIndex={-1} data-admin-confirmation="true" className="panel admin-reason-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title" onSubmit={submit}>
        <h2 id="admin-dialog-title">{title}</h2>
        {warning ? <p className="admin-warning-copy">{warning}</p> : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        {children}
        <label className="field">
          <span>Operator reason</span>
          <textarea required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className="admin-command-actions">
          <button className="button button-ghost" disabled={busy} type="button" onClick={onCancel}>Cancel</button>
          <button className={`button ${danger ? "button-danger" : "button-primary"}`} disabled={busy || confirmDisabled || !ready} type="submit">
            {busy ? "Working…" : "Confirm action"}
          </button>
        </div>
      </form>
    </div>
  );
}
