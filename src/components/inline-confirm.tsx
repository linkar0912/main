"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A second step for destructive actions, shown in place next to the control
 * that asked for it. Focus lands on Cancel so a stray Enter never confirms,
 * and Escape backs out.
 */
export function InlineConfirm({
  label,
  message,
  confirmLabel,
  busyLabel,
  busy = false,
  confirmType = "button",
  tone = "danger",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  /** Accessible name for the confirmation group. */
  label: string;
  message: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  /** "submit" lets the confirm button submit an enclosing form. */
  confirmType?: "button" | "submit";
  /** "primary" for a reversible change (switching plans); destructive steps stay "danger". */
  tone?: "danger" | "primary";
  /** Names what backing out keeps when "Cancel" would be ambiguous ("Keep subscription"). */
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className={`inline-confirm${tone === "primary" ? " is-neutral" : ""}`}
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || busy) return;
        event.stopPropagation();
        onCancel();
      }}
    >
      <p>{message}</p>
      <div className="button-row">
        <button ref={cancelRef} className="button button-secondary button-small" type="button" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          className={`button ${tone === "primary" ? "button-primary" : "button-danger"} button-small`}
          type={confirmType}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={onConfirm}
        >
          {busy && busyLabel ? busyLabel : confirmLabel}
        </button>
      </div>
    </div>
  );
}
