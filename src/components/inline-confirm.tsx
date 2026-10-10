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
  onConfirm?: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="inline-confirm"
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
          Cancel
        </button>
        <button
          className="button button-danger button-small"
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
