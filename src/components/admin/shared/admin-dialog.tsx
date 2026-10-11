"use client";

import { FormEvent, useId } from "react";
import { X } from "lucide-react";

import { useAdminDialog } from "./use-admin-dialog";

/**
 * The one dialog frame in the owner console: the title and a close button stay
 * at the top, the body scrolls, and the actions stay pinned at the bottom, so
 * Cancel and the primary button are reachable on a 745px laptop or a phone.
 */
export function AdminDialog({
  title,
  onClose,
  onSubmit,
  busy = false,
  wide = false,
  footer,
  children,
  closeLabel = "Close",
}: {
  title: React.ReactNode;
  onClose: () => void;
  /** When set the dialog is a form and Enter submits it. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** While a command runs the dialog cannot be dismissed. */
  busy?: boolean;
  /** For dialogs that hold a form (plan and limits). */
  wide?: boolean;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  closeLabel?: string;
}) {
  const titleId = useId();
  const dialogRef = useAdminDialog<HTMLFormElement>(onClose, busy);

  return (
    <div className="admin-dialog-backdrop" role="presentation">
      <form
        ref={dialogRef}
        tabIndex={-1}
        data-admin-confirmation="true"
        className={`admin-reason-dialog ${wide ? "is-wide" : ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.(event);
        }}
      >
        <div className="admin-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button className="admin-dialog-close" type="button" data-dialog-close="" aria-label={closeLabel} disabled={busy} onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="admin-dialog-body">{children}</div>
        {footer ? <div className="admin-actions admin-dialog-foot">{footer}</div> : null}
      </form>
    </div>
  );
}
