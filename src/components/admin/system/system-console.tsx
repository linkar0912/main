"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Gauge, RadioTower, Server } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import { StatusBadge, type StatusTone } from "@/src/components/ui/status-badge";
import type { AdminProbe, AdminSystemSnapshot } from "@/src/lib/admin/system/types";
import { adminCommand, adminErrorMessage, adminQuery, humanizeAdminCode } from "../shared/admin-request";
import { ReasonDialog } from "../shared/reason-dialog";
import { IncidentTable } from "./incident-table";

type Pending =
  | { type: "queue"; queue: string; action: "pause" | "resume" }
  | { type: "retry"; queue: string; jobIds: string[] }
  | { type: "system"; action: "run_delivery_reconciliation" | "run_usage_reconciliation" };

type FailedJob = { id: string; name: string; failedAt: string | null; attemptsMade: number; code: string | null };
type FailedJobList = { queue: string; jobs: FailedJob[] | null; selected: string[]; error: string | null };

// The retry endpoint accepts at most this many job IDs per audited command.
const MAX_RETRY_BATCH = 100;

const queueNames: Record<string, string> = { webhooks: "Incoming events", bulk: "Bulk sends" };
function queueName(name: string): string {
  return queueNames[name] ?? humanizeAdminCode(name);
}

function commandLabel(pending: Pending): string {
  if (pending.type === "retry") return `Retry ${pending.jobIds.length} failed ${pending.jobIds.length === 1 ? "job" : "jobs"} in ${queueName(pending.queue)}`;
  if (pending.type === "queue") return `${pending.action === "pause" ? "Pause" : "Resume"} ${queueName(pending.queue)}`;
  return pending.action === "run_delivery_reconciliation" ? "Re-check stuck sends" : "Recount plan usage";
}

function queueState(queue: AdminSystemSnapshot["queues"][number]): "unavailable" | "paused" | "running" {
  if (!queue.configured || queue.paused === null) return "unavailable";
  return queue.paused ? "paused" : "running";
}

const probeBadges: Record<AdminProbe["state"], { tone: StatusTone; label: string }> = {
  healthy: { tone: "success", label: "Healthy" },
  degraded: { tone: "warning", label: "Needs attention" },
  unavailable: { tone: "danger", label: "Down" },
};

function count(value: number | null | undefined): string {
  return value === null || value === undefined ? "Unknown" : value.toLocaleString("en-IN");
}

export function SystemConsole({ snapshot }: { snapshot: AdminSystemSnapshot }) {
  const router = useRouter();
  const [renderedAt, setRenderedAt] = useState(() => Date.parse(snapshot.generatedAt));
  useEffect(() => {
    const timer = window.setInterval(() => setRenderedAt(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failedList, setFailedList] = useState<FailedJobList | null>(null);
  const reviewingFailures = failedList !== null;

  useEffect(() => {
    const timer = setInterval(() => {
      // A refresh while reviewing failed jobs would re-render under the operator's selection.
      if (document.visibilityState === "visible" && !pending && !reviewingFailures) router.refresh();
    }, 20_000);
    return () => clearInterval(timer);
  }, [pending, reviewingFailures, router]);

  async function reviewFailedJobs(queue: string) {
    setNotice(null);
    setFailedList({ queue, jobs: null, selected: [], error: null });
    try {
      const jobs = await adminQuery<FailedJob[]>(`/api/admin/system/queues/${queue}`, { fallback: "queue_failed_jobs_unavailable" });
      setFailedList((current) => current?.queue === queue ? { ...current, jobs } : current);
    } catch (cause) {
      const message = adminErrorMessage(cause, "Failed jobs unavailable");
      setFailedList((current) => current?.queue === queue ? { ...current, jobs: [], error: message } : current);
    }
  }

  function toggleJob(id: string, checked: boolean) {
    setFailedList((current) => current ? { ...current, selected: checked ? [...current.selected, id] : current.selected.filter((item) => item !== id) } : current);
  }

  function toggleAll(checked: boolean) {
    setFailedList((current) => current ? { ...current, selected: checked ? (current.jobs ?? []).slice(0, MAX_RETRY_BATCH).map((job) => job.id) : [] } : current);
  }

  function openCommand(next: Pending) {
    setError(null);
    setNotice(null);
    setPending(next);
  }

  function cancelCommand() {
    setError(null);
    setPending(null);
  }

  async function execute(reason: string) {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const url = pending.type === "system" ? "/api/admin/system" : `/api/admin/system/queues/${pending.queue}`;
      const body = pending.type === "retry" ? { action: "retry_failed_jobs", jobIds: pending.jobIds } : { action: pending.action };
      await adminCommand(url, { method: pending.type === "system" ? "POST" : "PATCH", body, reason, fallback: "system_command_failed" });
      setNotice(`${commandLabel(pending)}: requested.`);
      if (pending.type === "retry") setFailedList(null);
      setPending(null);
      router.refresh();
    } catch (cause) {
      setError(adminErrorMessage(cause, "System command failed"));
    } finally {
      setBusy(false);
    }
  }

  const probes = [
    ["Web app", snapshot.web, Gauge],
    ["Database", snapshot.database, Database],
    ["Job queue (Redis)", snapshot.redis, RadioTower],
    ["Background worker", snapshot.worker, Server],
  ] as const;
  const stale = renderedAt - Date.parse(snapshot.generatedAt) > 60_000;
  const activeIncidents = snapshot.incidents.filter((incident) => incident.status !== "RESOLVED").length;
  const healthy = snapshot.overall === "healthy";
  const missing = snapshot.configurationPresence.filter((item) => !item.present).length;

  return (
    <main className="page-wrap admin-page">
      <PageHeader
        title="Service health"
        description="How Linkar's servers, background jobs and settings are doing right now."
        actions={(
          <>
            <StatusBadge tone={healthy ? "success" : "warning"} label={healthy ? "Healthy" : "Needs attention"} />
            {snapshot.release ? <IdChip id={snapshot.release} prefix="Version" /> : null}
          </>
        )}
      />

      {notice ? <div className="form-success admin-message" role="status">{notice}</div> : null}

      <section className="admin-section" aria-label="Production status summary">
        <div className="admin-results">
          <span>Checked <RelativeTime inline value={snapshot.generatedAt} />{stale ? ". This page may be out of date; it refreshes every 20 seconds." : ""}</span>
        </div>
        <div className="admin-summary-strip">
          <div className="admin-stat">
            <span>Incidents</span>
            <strong>{snapshot.operationalDataAvailable === false ? "–" : activeIncidents}</strong>
            <small>{snapshot.operationalDataAvailable === false ? "Incident status unavailable" : activeIncidents === 0 ? "No active incidents" : `${activeIncidents} active ${activeIncidents === 1 ? "incident" : "incidents"}`}</small>
          </div>
          <div className="admin-stat">
            <span>Stuck message sends</span>
            <strong>{count(snapshot.stuckClaims)}</strong>
            <small>Sends that stopped without a result</small>
          </div>
          <div className="admin-stat">
            <span>Meta events</span>
            <strong>{count(snapshot.webhookThroughput.lastHour)}</strong>
            <small>Received in the last hour</small>
          </div>
          <div className="admin-stat">
            <span>Failed billing updates</span>
            <strong>{count(snapshot.billing.failedWebhooksLastHour)}</strong>
            <small>From Razorpay in the last hour</small>
          </div>
        </div>
      </section>

      <section className="admin-probes" aria-label="Runtime probes">
        {probes.map(([name, probe, Icon]) => (
          <div className="admin-probe" key={name}>
            <span className="admin-probe-name"><Icon size={18} aria-hidden /> {name}</span>
            <StatusBadge tone={probeBadges[probe.state].tone} label={probeBadges[probe.state].label} />
            {probe.detail ? <p>{probe.detail}</p> : null}
            {probe.lastSeenAt ? <p>Last check-in <RelativeTime inline value={probe.lastSeenAt} /></p> : null}
            {probe.release ? <IdChip id={probe.release} prefix="Version" /> : null}
          </div>
        ))}
      </section>

      {snapshot.operationalDataAvailable === false
        ? <p className="form-error admin-message" role="status">Operational data could not be loaded, so incident and workload counts are unavailable.</p>
        : <IncidentTable incidents={snapshot.incidents} now={new Date(renderedAt).toISOString()} />}

      <div className="admin-columns is-wide-left">
        <section className="admin-card is-flush" aria-labelledby="queue-heading">
          <div className="admin-card-head">
            <div><h2 id="queue-heading">Background jobs</h2><p>Work waiting to run, and controls to pause or retry it.</p></div>
          </div>
          {snapshot.queues.map((queue) => {
            const state = queueState(queue);
            const shown = (value: number) => state === "unavailable" ? "–" : value.toLocaleString("en-IN");
            return (
              <div className="admin-queue" key={queue.name}>
                <div className="admin-queue-head">
                  <strong>{queueName(queue.name)}</strong>
                  <StatusBadge tone={state === "running" ? "success" : state === "paused" ? "warning" : "danger"} label={state === "unavailable" ? "Unavailable" : state === "paused" ? "Paused" : "Running"} />
                </div>
                <dl className="admin-queue-counts">
                  <div><dt>Waiting</dt><dd>{shown(queue.waiting)}</dd></div>
                  <div><dt>In progress</dt><dd>{shown(queue.active)}</dd></div>
                  <div><dt>Scheduled</dt><dd>{shown(queue.delayed)}</dd></div>
                  <div><dt>Failed</dt><dd>{shown(queue.failed)}</dd></div>
                </dl>
                <p className="admin-hint">{queue.lastFailedCode ? <>Latest failure: {humanizeAdminCode(queue.lastFailedCode.toLowerCase())}</> : state === "unavailable" ? "Failure history unavailable" : "No recorded failures"}</p>
                <div className="admin-actions">
                  <button className="button button-secondary button-small" disabled={state === "unavailable"} type="button" onClick={() => openCommand({ type: "queue", queue: queue.name, action: queue.paused ? "resume" : "pause" })}>{queue.paused ? "Resume queue" : "Pause queue"}</button>
                  {state !== "unavailable" && queue.failed > 0 ? (
                    <button className="button button-ghost button-small" type="button" aria-expanded={failedList?.queue === queue.name} aria-controls={`failed-jobs-${queue.name}`} onClick={() => failedList?.queue === queue.name ? setFailedList(null) : void reviewFailedJobs(queue.name)}>
                      {failedList?.queue === queue.name ? "Hide failed jobs" : "Review failed jobs"}
                    </button>
                  ) : null}
                </div>
                {failedList?.queue === queue.name ? (
                  <FailedJobsPanel
                    list={failedList}
                    onToggle={toggleJob}
                    onToggleAll={toggleAll}
                    onRetry={() => openCommand({ type: "retry", queue: queue.name, jobIds: failedList.selected.slice(0, MAX_RETRY_BATCH) })}
                  />
                ) : null}
              </div>
            );
          })}
          <div className="admin-card-foot">
            <div className="admin-list-main">
              <strong>Fix-ups</strong>
              <span className="admin-hint">{snapshot.reconciliation.expiredDeliveryClaims === null ? "Stuck send count unavailable" : snapshot.reconciliation.expiredDeliveryClaims === 0 ? "No stuck sends right now" : `${snapshot.reconciliation.expiredDeliveryClaims} stuck sends to re-check`}</span>
            </div>
            <div className="admin-actions">
              <button className="button button-secondary button-small" type="button" onClick={() => openCommand({ type: "system", action: "run_delivery_reconciliation" })}>Re-check stuck sends</button>
              <button className="button button-secondary button-small" type="button" onClick={() => openCommand({ type: "system", action: "run_usage_reconciliation" })}>Recount plan usage</button>
            </div>
          </div>
        </section>

        <aside className="admin-card is-flush" aria-labelledby="posture-heading">
          <div className="admin-card-head">
            <div>
              <h2 id="posture-heading">Setup checklist</h2>
              <p>{missing === 0 ? "Everything Linkar needs is set." : `${missing} ${missing === 1 ? "setting needs" : "settings need"} attention. Values stay secret; only presence is checked.`}</p>
            </div>
          </div>
          <ul className="admin-readiness">
            {snapshot.configurationPresence.map((item) => (
              <li key={item.requirement}>
                <span className="admin-readiness-row">
                  <span>{item.requirement}</span>
                  <StatusBadge tone={item.present ? "success" : "warning"} label={item.present ? "Ready" : "Missing"} />
                </span>
                {!item.present && item.fix ? <span className="admin-hint">{item.fix}</span> : null}
              </li>
            ))}
          </ul>
          {!snapshot.billing.configured ? <p className="admin-callout admin-card-note">Razorpay billing is not set up, so customers cannot pay for plans.</p> : null}
          <dl className="admin-kv admin-card-kv">
            <div><dt>Subscriptions needing attention</dt><dd>{count(snapshot.billing.driftedSubscriptions)}</dd></div>
            <div><dt>Failed deletions</dt><dd>{count(snapshot.deletionJobs.failed)}</dd></div>
            <div><dt>Follow-to-unlock campaigns</dt><dd>{snapshot.capabilities.followGatedCampaigns === "enabled" ? "On" : "Off"}</dd></div>
          </dl>
        </aside>
      </div>

      {pending ? (
        <ReasonDialog
          error={error}
          title={commandLabel(pending)}
          warning="This changes how Linkar runs right now and is recorded in the audit log."
          busy={busy}
          onCancel={cancelCommand}
          onConfirm={execute}
        />
      ) : null}
    </main>
  );
}

function FailedJobsPanel({ list, onToggle, onToggleAll, onRetry }: {
  list: FailedJobList;
  onToggle: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onRetry: () => void;
}) {
  const jobs = list.jobs ?? [];
  const selectable = jobs.slice(0, MAX_RETRY_BATCH);
  const allSelected = selectable.length > 0 && selectable.every((job) => list.selected.includes(job.id));
  return (
    <div className="admin-failed-jobs" id={`failed-jobs-${list.queue}`} role="region" aria-label={`Failed ${list.queue} jobs`} aria-busy={list.jobs === null}>
      {list.error ? <div className="form-error admin-message" role="alert">{list.error}</div> : null}
      {list.jobs === null ? <p className="admin-hint">Loading failed jobs…</p> : null}
      {list.jobs !== null && !list.error && jobs.length === 0 ? <p className="admin-hint">No failed jobs are kept for this queue.</p> : null}
      {jobs.length > 0 ? (
        <>
          <p className="admin-hint">The {jobs.length} most recent failed jobs. Only retry the ones whose cause is fixed.</p>
          <label className="admin-check">
            <input type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} /> Select all
          </label>
          <ul className="admin-list">
            {jobs.map((job) => (
              <li key={job.id}>
                <label className="admin-check">
                  <input type="checkbox" checked={list.selected.includes(job.id)} disabled={!list.selected.includes(job.id) && list.selected.length >= MAX_RETRY_BATCH} onChange={(event) => onToggle(job.id, event.target.checked)} aria-label={`Select failed job ${job.id}`} />
                  <span className="admin-list-main">
                    <strong>{humanizeAdminCode(job.name.replaceAll("-", "_"))}</strong>
                    <span className="cell-meta">
                      <span>{job.code ? humanizeAdminCode(job.code.toLowerCase()) : "No failure code"}</span>
                      <span>{job.attemptsMade} {job.attemptsMade === 1 ? "attempt" : "attempts"}</span>
                      {job.failedAt ? <span>Failed <RelativeTime inline value={job.failedAt} /></span> : null}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="admin-actions">
            <button className="button button-secondary button-small" type="button" disabled={list.selected.length === 0} onClick={onRetry}>
              Retry selected ({list.selected.length})
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
