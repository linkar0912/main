"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import { AdminDialog } from "./admin-dialog";

/** Every audited command asks for a reason under this one label. */
export const REASON_LABEL = "Reason (saved to the audit log)";

/** The reason field every audited command shares: always labelled, always 3+ characters. */
export function ReasonField({ value, onChange, rows = 3 }: { value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="field">
      <span>{REASON_LABEL}</span>
      <textarea required minLength={3} maxLength={500} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

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
  cancelLabel = "Cancel",
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
  /** Rename Cancel when the action itself is a cancellation. */
  cancelLabel?: string;
}) {
  const [reason, setReason] = useState("");
  const ready = reason.trim().length >= 3;

  function submit() {
    if (!busy && !confirmDisabled && ready) onConfirm(reason.trim());
  }

  return (
    <AdminDialog
      title={title}
      wide={wide}
      busy={busy}
      onClose={onCancel}
      onSubmit={submit}
      footer={(
        <>
          <button className="button button-ghost" disabled={busy} type="button" onClick={onCancel}>{cancelLabel}</button>
          <button className={`button ${danger ? "button-danger" : "button-primary"}`} disabled={busy || confirmDisabled || !ready} type="submit">
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      )}
    >
      {intro ? <p className="admin-dialog-intro">{intro}</p> : null}
      {warning ? <p className={`admin-callout ${danger ? "is-danger" : ""}`}><TriangleAlert size={16} aria-hidden /><span>{warning}</span></p> : null}
      {error ? <div className="form-error admin-message" role="alert">{error}</div> : null}
      {children}
      <ReasonField value={reason} onChange={setReason} />
    </AdminDialog>
  );
}
