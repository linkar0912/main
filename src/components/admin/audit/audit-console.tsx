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
import { ReasonDialog } from "../shared/reason-dialog";

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

// The action filter matches any key that contains the value, so a group's
// prefix ("workspace.") finds every action in that area.
const ACTION_GROUPS: Array<{ label: string; prefixes: string[]; any: string }> = [
  { label: "Workspaces", prefixes: ["workspace."], any: "Any workspace action" },
  { label: "Users", prefixes: ["user."], any: "Any user action" },
  { label: "Plans", prefixes: ["plan."], any: "Any plan change" },
  { label: "Invite codes", prefixes: ["premium_invite."], any: "Any invite code action" },
  { label: "Billing", prefixes: ["billing."], any: "Any billing event" },
  { label: "Connected accounts", prefixes: ["integration."], any: "Any connected account action" },
  { label: "Records", prefixes: ["operation."], any: "Any record change" },
  { label: "Service health", prefixes: ["system."], any: "Any service health action" },
  { label: "Delete data", prefixes: ["deletion.", "synthetic_cleanup."], any: "Any deletion" },
  { label: "Your security", prefixes: ["security."], any: "Any two-factor change" },
  { label: "Audit log", prefixes: ["audit."], any: "Any audit log export" },
];

function ActionFilter({ value }: { value: string }) {
  const known = new Set<string>(["", ...KNOWN_AUDIT_ACTIONS, ...ACTION_GROUPS.map((group) => group.prefixes[0])]);
  return (
    <select name="action" defaultValue={value}>
      <option value="">Any action</option>
      {known.has(value) ? null : <option value={value}>Contains “{value}”</option>}
      {ACTION_GROUPS.map((group) => {
        const actions = KNOWN_AUDIT_ACTIONS.filter((key) => group.prefixes.some((prefix) => key.startsWith(prefix)));
        return (
          <optgroup key={group.label} label={group.label}>
            <option value={group.prefixes[0]}>{group.any}</option>
            {actions.map((key) => <option key={key} value={key}>{describeAuditAction(key)}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

export function AuditConsole({ events, nextCursor, filters, cursor = null, history = [] }: { events: Event[]; nextCursor: string | null; filters: Record<string, string>; cursor?: string | null; history?: string[] }) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = Object.values(filters).some(Boolean);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }
    router.push(`/admin/audit${params.size ? `?${params}` : ""}`);
  }

  async function exportCsv(reason: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await adminCommandResponse("/api/admin/audit/export", { body: filters, reason, fallback: "audit_export_failed", idempotencyKey: adminIdempotencyKey("audit-export") });
      downloadAdminFile(await response.blob(), `linkar-audit-${new Date().toISOString().slice(0, 10)}.csv`);
      setExporting(false);
      setNotice("Audit log CSV downloaded.");
    } catch (cause) {
      setError(adminErrorMessage(cause, "Export failed. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-wrap admin-page">
      <PageHeader
        title="Audit log"
        description="Every admin action, newest first."
        actions={<button className="button button-secondary" type="button" onClick={() => { setError(null); setNotice(null); setExporting(true); }}><Download size={16} aria-hidden /> Export CSV</button>}
      />

      {notice ? <div className="form-success admin-message" role="status">{notice}</div> : null}

      <form key={JSON.stringify(filters)} className="admin-toolbar" role="search" onSubmit={applyFilters}>
        <label className="field"><span>Who</span><input name="actor" inputMode="email" autoCapitalize="none" spellCheck={false} defaultValue={filters.actor ?? ""} placeholder="Email address" /></label>
        <label className="field is-grow">
          <span>Action</span>
          <ActionFilter value={filters.action ?? ""} />
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

      {exporting ? (
        <ReasonDialog
          title="Export the audit log"
          intro={filtered
            ? "Downloads every event that matches the current filters as a CSV file. Secrets are removed, and the export itself is logged."
            : "Downloads every event as a CSV file. Secrets are removed, and the export itself is logged. Apply filters first to export fewer."}
          busy={busy}
          error={error}
          confirmLabel="Download CSV"
          onCancel={() => { setExporting(false); setError(null); }}
          onConfirm={(reason) => void exportCsv(reason)}
        />
      ) : null}
    </main>
  );
}
