"use client";

import { useState } from "react";
import { X } from "lucide-react";

import type { AdminOperationDetail } from "@/src/lib/admin/operations/types";
import { StatusPill } from "../shared/status-pill";
import { useAdminDialog } from "../shared/use-admin-dialog";
import { OperationActions } from "./operation-actions";

function attributeLabel(key: string): string {
  // Attribute keys arrive camelCased from the repository projection.
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase();
}

function attributeValue(value: string | number | boolean | null): string {
  if (value === null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function OperationDetailDrawer({
  detail,
  loading,
  error,
  onClose,
  onComplete,
}: {
  detail: AdminOperationDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onComplete: (message: string) => void;
}) {
  const [actionOpen, setActionOpen] = useState(false);
  const dialogRef = useAdminDialog<HTMLElement>(onClose, actionOpen);

  return (
    <aside ref={dialogRef} tabIndex={-1} className="admin-detail-drawer" role="dialog" aria-modal="true" aria-label="Operation detail">
      <button className="button button-ghost button-small admin-drawer-close" type="button" disabled={actionOpen} onClick={onClose} aria-label="Close operation detail">
        <X size={17} />
      </button>
      {loading ? <p className="muted" role="status">Loading operation…</p> : null}
      {!loading && error ? <div className="form-error" role="alert">{error}</div> : null}
      {!loading && !error && detail ? (
        <>
          <p className="eyebrow">{detail.kind.replaceAll("_", " ")} / {detail.id}</p>
          <h2>{detail.title}</h2>
          <p><StatusPill status={detail.status} /></p>
          <dl className="admin-inline-kv">
            <div><dt>Workspace</dt><dd>{detail.workspace.name}</dd></div>
            <div><dt>Workspace ID</dt><dd>{detail.workspace.id}</dd></div>
            <div><dt>Version</dt><dd>{detail.version}</dd></div>
            <div><dt>Provider</dt><dd>{detail.provider ?? "-"}</dd></div>
            {Object.entries(detail.attributes).map(([key, value]) => (
              <div key={key}><dt>{attributeLabel(key)}</dt><dd>{attributeValue(value)}</dd></div>
            ))}
          </dl>
          <OperationActions detail={detail} onComplete={onComplete} onPendingChange={setActionOpen} />
        </>
      ) : null}
    </aside>
  );
}
