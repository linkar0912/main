"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Download } from "lucide-react";

import { formatAdminDateTime } from "@/src/components/admin/shared/date-format";
import { AdminPagination } from "../shared/admin-pagination";
import { adminCommandResponse, adminErrorMessage, adminIdempotencyKey, downloadAdminFile } from "../shared/admin-request";
import { StatusPill } from "../shared/status-pill";

type Event = {
  id: string;
  requestId: string;
  phase: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  workspaceId: string | null;
  reason: string;
  before: unknown;
  after: unknown;
  errorCode: string | null;
  origin: string | null;
  createdAt: Date | string;
};

export function AuditConsole({ events, nextCursor, filters, cursor = null, history = [] }: { events: Event[]; nextCursor: string | null; filters: Record<string, string>; cursor?: string | null; history?: string[] }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtered = Object.values(filters).some(Boolean);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }
    router.push(`/admin/audit${params.size ? `?${params}` : ""}`);
  }

  async function exportCsv(event: FormEvent) {
    event.preventDefault();
    if (busy || reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const response = await adminCommandResponse("/api/admin/audit/export", { body: filters, reason, fallback: "audit_export_failed", idempotencyKey: adminIdempotencyKey("audit-export") });
      downloadAdminFile(await response.blob(), `linkar-audit-${new Date().toISOString().slice(0, 10)}.csv`);
      setReason("");
    } catch (cause) {
      setError(adminErrorMessage(cause, "Export failed. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-wrap admin-resource-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Linkar operator / accountability</p>
          <h1>Immutable audit trail</h1>
          <p className="muted page-lede">Every privileged attempt, success, and failure in descending event order.</p>
        </div>
      </header>

      <form key={JSON.stringify(filters)} className="admin-filter-bar admin-audit-filter" role="search" onSubmit={applyFilters}>
        <label className="field"><span>Actor</span><input name="actor" defaultValue={filters.actor ?? ""} placeholder="Email address" /></label>
        <label className="field"><span>Action</span><input name="action" defaultValue={filters.action ?? ""} placeholder="workspace.suspend" /></label>
        <label className="field">
          <span>Phase</span>
          <select name="phase" defaultValue={filters.phase ?? ""}>
            <option value="">All</option>
            <option value="ATTEMPT">Attempt</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILURE">Failure</option>
          </select>
        </label>
        <button className="button button-secondary" type="submit">Apply filters</button>
      </form>

      <section className="panel admin-table-panel" aria-label="Audit events">
        <form className="admin-audit-export" onSubmit={exportCsv}>
          <label className="field">
            <span>Export reason</span>
            <input value={reason} minLength={3} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Why this export is needed" />
          </label>
          <button className="button button-secondary" disabled={busy || reason.trim().length < 3} type="submit">
            <Download size={16} aria-hidden /> {busy ? "Exporting…" : "Export safe CSV"}
          </button>
        </form>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        {events.length === 0 ? (
          <div className="empty-state">
            <h2>No audit events found</h2>
            <p>{filtered ? "No events match these filters." : "Privileged actions will be recorded here."}</p>
          </div>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table admin-audit-table">
              <thead>
                <tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Result</th><th>Details</th></tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatAdminDateTime(event.createdAt)}<small>{event.requestId}</small></td>
                    <td>{event.actorEmail}</td>
                    <td><strong>{event.action}</strong></td>
                    <td>{event.targetType}<small>{event.targetId}</small></td>
                    <td><StatusPill status={event.phase} />{event.errorCode ? <small>{event.errorCode}</small> : null}</td>
                    <td>
                      <details>
                        <summary>Redacted summary</summary>
                        <p>{event.reason}</p>
                        <pre>{JSON.stringify({ before: event.before, after: event.after }, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdminPagination
        basePath="/admin/audit"
        params={filters}
        cursor={cursor}
        history={history}
        nextCursor={nextCursor}
        label="Audit pagination"
        summary={`${events.length} events on this page`}
        nextLabel="Older events"
      />
    </main>
  );
}
