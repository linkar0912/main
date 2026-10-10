"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Download } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import { StatusBadge } from "@/src/components/ui/status-badge";
import { AdminPagination } from "../shared/admin-pagination";
import { adminCommandResponse, adminErrorMessage, adminIdempotencyKey, downloadAdminFile, humanizeAdminCode } from "../shared/admin-request";
import { describeAuditAction, KNOWN_AUDIT_ACTIONS } from "../shared/audit-actions";
import { REASON_LABEL } from "../shared/reason-dialog";

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

const phaseTone = { SUCCESS: "success", FAILURE: "danger", ATTEMPT: "neutral" } as const;

const TARGET_TYPES: Record<string, string> = {
  mfa_factor: "Two-factor app",
  premium_invite: "Invite code",
  workspace_member: "Workspace member",
  deletion_job: "Deletion",
  billing_subscription: "Subscription",
  instagram_connection: "Instagram account",
  facebook_connection: "Facebook Page",
  queue: "Job queue",
  audit: "Audit log",
  tracked_link: "Tracked link",
  delivery: "Message delivery",
  webhook: "Incoming Meta event",
};

function targetLabel(type: string): string {
  return TARGET_TYPES[type] ?? humanizeAdminCode(type);
}

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
    <main className="page-wrap admin-page">
      <PageHeader title="Audit log" description="Every admin action, newest first." />

      <form key={JSON.stringify(filters)} className="admin-toolbar" role="search" onSubmit={applyFilters}>
        <label className="field"><span>Who</span><input name="actor" defaultValue={filters.actor ?? ""} placeholder="Email address" /></label>
        <label className="field is-grow">
          <span>Action</span>
          <input name="action" list="audit-action-options" defaultValue={filters.action ?? ""} placeholder="For example workspace.suspend" />
          <datalist id="audit-action-options">
            {KNOWN_AUDIT_ACTIONS.map((key) => <option key={key} value={key}>{describeAuditAction(key)}</option>)}
          </datalist>
        </label>
        <label className="field">
          <span>Outcome</span>
          <select name="phase" defaultValue={filters.phase ?? ""}>
            <option value="">Any</option>
            <option value="ATTEMPT">Started</option>
            <option value="SUCCESS">Succeeded</option>
            <option value="FAILURE">Failed</option>
          </select>
        </label>
        <button className="button button-secondary" type="submit">Apply filters</button>
      </form>

      <section className="admin-section" aria-label="Audit events">
        <div className="admin-results"><span>{events.length ? `Showing ${events.length} ${events.length === 1 ? "event" : "events"}` : "No events to show"}</span></div>
        <div className="admin-card is-flush">
          {events.length === 0 ? (
            <div className="admin-empty">
              <p>{filtered ? "No events match these filters." : "Admin actions are recorded here as they happen."}</p>
            </div>
          ) : (
            <ol className="admin-activity">
              {events.map((event) => {
                const tone = phaseTone[event.phase as keyof typeof phaseTone] ?? "neutral";
                return (
                  <li key={event.id}>
                    <span className={`admin-activity-dot is-${tone}`} aria-hidden />
                    <div className="admin-activity-body">
                      <strong>{describeAuditAction(event.action)}</strong>
                      {event.reason ? <p>{event.reason}</p> : null}
                      <div className="cell-meta">
                        <span>by {event.actorEmail}</span>
                        {event.workspaceId
                          ? <Link href={`/admin/workspaces/${event.workspaceId}`}>Open workspace</Link>
                          : <span>{targetLabel(event.targetType)}</span>}
                        {event.phase !== "SUCCESS" ? <StatusBadge tone={tone} label={event.phase === "FAILURE" ? "Failed" : "Started"} /> : null}
                        {event.errorCode ? <span>{humanizeAdminCode(event.errorCode)}</span> : null}
                      </div>
                      <details className="admin-audit-details">
                        <summary>Details</summary>
                        <dl className="admin-kv">
                          <div><dt>Action key</dt><dd><code>{event.action}</code></dd></div>
                          <div><dt>{targetLabel(event.targetType)}</dt><dd><IdChip id={event.targetId} /></dd></div>
                          <div><dt>Request</dt><dd><IdChip id={event.requestId} /></dd></div>
                        </dl>
                        <pre>{JSON.stringify({ before: event.before, after: event.after }, null, 2)}</pre>
                      </details>
                    </div>
                    <RelativeTime value={typeof event.createdAt === "string" ? event.createdAt : event.createdAt.toISOString()} className="admin-activity-time" />
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <AdminPagination
          basePath="/admin/audit"
          params={filters}
          cursor={cursor}
          history={history}
          nextCursor={nextCursor}
          label="Audit pagination"
          summary={null}
          nextLabel="Older events"
        />
      </section>

      <section className="admin-card" aria-labelledby="audit-export-title">
        <div className="admin-card-head">
          <div>
            <h2 id="audit-export-title">Export as CSV</h2>
            <p>Downloads the events that match the filters above. Secrets are removed before export, and the export itself is logged.</p>
          </div>
        </div>
        <form className="admin-toolbar" onSubmit={exportCsv}>
          <label className="field is-grow">
            <span>{REASON_LABEL}</span>
            <input value={reason} minLength={3} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Why this export is needed" />
          </label>
          <button className="button button-secondary" disabled={busy || reason.trim().length < 3} type="submit">
            <Download size={16} aria-hidden /> {busy ? "Exporting…" : "Download CSV"}
          </button>
        </form>
        {error ? <div className="form-error admin-message" role="alert">{error}</div> : null}
      </section>
    </main>
  );
}
