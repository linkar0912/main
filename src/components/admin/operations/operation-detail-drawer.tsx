"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import type { AdminOperationDetail } from "@/src/lib/admin/operations/types";
import { StatusPill } from "../shared/status-pill";
import { useAdminDialog } from "../shared/use-admin-dialog";
import { kindLabels } from "./labels";
import { OperationActions } from "./operation-actions";

function attributeLabel(key: string): string {
  // Attribute keys arrive camelCased from the repository projection.
  const text = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase();
  return `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;
}

function attributeValue(value: string | number | boolean | null): string {
  if (value === null || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const providerNames = { instagram: "Instagram", facebook: "Facebook" } as const;

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
      <div className="admin-drawer-head">
        <div>
          {detail && !loading && !error ? (
            <>
              <h2>{detail.title}</h2>
              <div className="admin-header-meta">
                <StatusPill status={detail.status} />
                <span className="admin-hint">{kindLabels[detail.kind].singular}</span>
              </div>
            </>
          ) : <h2>Record</h2>}
        </div>
        <button className="button button-ghost button-small" type="button" disabled={actionOpen} onClick={onClose} aria-label="Close operation detail">
          <X size={17} aria-hidden />
        </button>
      </div>
      {loading ? <p className="admin-hint" role="status">Loading…</p> : null}
      {!loading && error ? <div className="form-error admin-message" role="alert">{error}</div> : null}
      {!loading && !error && detail ? (
        <>
          <dl className="admin-kv">
            <div><dt>Workspace</dt><dd>{detail.workspace.name}</dd></div>
            <div><dt>Workspace ID</dt><dd><IdChip id={detail.workspace.id} /></dd></div>
            <div><dt>Record ID</dt><dd><IdChip id={detail.id} /></dd></div>
            <div><dt>Platform</dt><dd>{detail.provider ? providerNames[detail.provider] : "None"}</dd></div>
            <div><dt>Last updated</dt><dd><RelativeTime value={detail.updatedAt} fallback="Unknown" /></dd></div>
            <div><dt>Edit number</dt><dd>{detail.version}</dd></div>
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
