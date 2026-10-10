"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CircleCheck, CircleX, Database, Gauge, RadioTower, Server } from "lucide-react";

import { formatAdminDateTime } from "@/src/components/admin/shared/date-format";
import type { AdminSystemSnapshot } from "@/src/lib/admin/system/types";
import { adminCommand, adminErrorMessage, adminQuery } from "../shared/admin-request";
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

function commandLabel(pending: Pending): string {
  if (pending.type === "retry") return `retry ${pending.jobIds.length} failed ${pending.queue} job${pending.jobIds.length === 1 ? "" : "s"}`;
  const action = pending.action.replaceAll("_", " ");
  return pending.type === "queue" ? `${action} ${pending.queue} queue` : action;
}

function queueState(queue: AdminSystemSnapshot["queues"][number]): "unavailable" | "paused" | "running" {
  if (!queue.configured || queue.paused === null) return "unavailable";
  return queue.paused ? "paused" : "running";
}

function probeLabel(state: string, detail?: string): string {
  const label = state === "unavailable" ? "Unavailable" : state;
  return `${label}${detail ? ` · ${detail}` : ""}`;
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
      setNotice(`${commandLabel(pending)} accepted`);
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
    ["Web", snapshot.web, Gauge],
    ["Database", snapshot.database, Database],
    ["Redis", snapshot.redis, RadioTower],
    ["Worker", snapshot.worker, Server],
  ] as const;
  const stale = renderedAt - Date.parse(snapshot.generatedAt) > 60_000;
  const activeIncidents = snapshot.incidents.filter((incident) => incident.status !== "RESOLVED").length;
  const activeLabel = `${activeIncidents} active incident${activeIncidents === 1 ? "" : "s"}`;

  return (
    <main className="page-wrap admin-resource-page admin-system-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Linkar operator / infrastructure</p>
          <h1>System</h1>
          <p className="muted page-lede">Production health, incident history, queues, billing readiness, and recovery controls.</p>
        </div>
        <span className={`admin-release ${snapshot.overall === "healthy" ? "is-ok" : "is-degraded"}`}>
          <Activity size={15} aria-hidden /> {snapshot.overall === "healthy" ? "Operational" : "Attention needed"} · {snapshot.release ?? "release unknown"}
        </span>
      </header>

      {notice ? <div className="form-success" role="status">{notice}</div> : null}

      <section className="panel admin-ops-summary" aria-label="Production status summary">
        <div className="admin-ops-primary">
          <span className={`admin-ops-signal is-${activeIncidents > 0 ? "attention" : "healthy"}`} aria-hidden>
            {activeIncidents > 0 ? <CircleX size={22} /> : <CircleCheck size={22} />}
          </span>
          <div><strong>{snapshot.operationalDataAvailable === false ? "Incident status unavailable" : activeIncidents > 0 ? activeLabel : "No active incidents"}</strong><small>Snapshot {formatAdminDateTime(snapshot.generatedAt)}{stale ? " · Stale" : ""}</small></div>
        </div>
        <div className="admin-ops-fact"><span>Razorpay</span><strong>{snapshot.billing.configured ? "Ready" : "Needs configuration"}</strong></div>
        <div className="admin-ops-fact"><span>Billing webhooks failed</span><strong>{snapshot.billing.failedWebhooksLastHour ?? "Unavailable"}</strong></div>
        <div className="admin-ops-fact"><span>Stuck deliveries</span><strong>{snapshot.stuckClaims ?? "Unavailable"}</strong></div>
      </section>

      <section className="panel admin-probe-panel" aria-label="Runtime probes">
        {probes.map(([name, probe, Icon]) => (
          <div className="admin-probe-row" key={name}>
            <Icon size={18} aria-hidden />
            <span>{name}</span>
            <strong className={`is-${probe.state}`}>{probeLabel(probe.state, probe.detail)}</strong>
          </div>
        ))}
      </section>

      {snapshot.operationalDataAvailable === false ? <p className="form-error" role="status">Operational data could not be loaded. Incident and workload counts are unavailable.</p> : <IncidentTable incidents={snapshot.incidents} now={new Date(renderedAt).toISOString()} />}

      <div className="admin-system-layout">
        <section className="panel admin-operations-panel" aria-labelledby="queue-heading">
          <div className="admin-section-heading"><div><h2 id="queue-heading">Queue operations</h2><p>Live workload and bounded operator controls.</p></div></div>
          {snapshot.queues.map((queue) => {
            const state = queueState(queue);
            const count = (value: number) => state === "unavailable" ? "–" : value;
            return (
              <div className="admin-queue-row" key={queue.name}>
                <div className="admin-queue-name"><strong>{queue.name}</strong><span className={`is-${state}`}>{state === "unavailable" ? "Unavailable" : state === "paused" ? "Paused" : "Running"}</span></div>
                <dl>
                  <div><dt>Waiting</dt><dd>{count(queue.waiting)}</dd></div>
                  <div><dt>Active</dt><dd>{count(queue.active)}</dd></div>
                  <div><dt>Delayed</dt><dd>{count(queue.delayed)}</dd></div>
                  <div><dt>Failed</dt><dd>{count(queue.failed)}</dd></div>
                </dl>
                <div className="admin-queue-action">
                  {queue.lastFailedCode ? <small>Latest failure: <code>{queue.lastFailedCode}</code></small> : <small>{state === "unavailable" ? "Failure history unavailable" : "No recorded failures"}</small>}
                  <span className="admin-command-actions">
                    {state !== "unavailable" && queue.failed > 0 ? (
                      <button className="button button-ghost button-small" type="button" aria-expanded={failedList?.queue === queue.name} aria-controls={`failed-jobs-${queue.name}`} onClick={() => failedList?.queue === queue.name ? setFailedList(null) : void reviewFailedJobs(queue.name)}>
                        {failedList?.queue === queue.name ? "Hide failed jobs" : "Review failed jobs"}
                      </button>
                    ) : null}
                    <button className="button button-secondary button-small" disabled={state === "unavailable"} type="button" onClick={() => openCommand({ type: "queue", queue: queue.name, action: queue.paused ? "resume" : "pause" })}>{queue.paused ? "Resume queue" : "Pause queue"}</button>
                  </span>
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
          <div className="admin-maintenance-row">
            <div><strong>Reconciliation</strong><small>{snapshot.reconciliation.expiredDeliveryClaims === null ? "Expired claim count unavailable" : `${snapshot.reconciliation.expiredDeliveryClaims} expired delivery claims`}</small></div>
            <div className="admin-command-actions">
              <button className="button button-secondary button-small" type="button" onClick={() => openCommand({ type: "system", action: "run_delivery_reconciliation" })}>Reconcile deliveries</button>
              <button className="button button-secondary button-small" type="button" onClick={() => openCommand({ type: "system", action: "run_usage_reconciliation" })}>Reconcile usage</button>
            </div>
          </div>
        </section>

        <aside className="panel admin-posture-panel" aria-labelledby="posture-heading">
          <div className="admin-section-heading"><div><h2 id="posture-heading">Readiness</h2><p>Presence checks only. Values stay secret.</p></div></div>
          <ul className="admin-readiness-list">
            {snapshot.configurationPresence.map((item) => (
              <li key={item.requirement}><span className="health-orb" data-state={item.present ? "ok" : "warn"} aria-hidden /><span>{item.requirement}</span><strong>{item.present ? "Ready" : "Missing"}</strong></li>
            ))}
          </ul>
          <dl className="admin-posture-metrics">
            <div><dt>Webhooks / hour</dt><dd>{snapshot.webhookThroughput.lastHour ?? "Unavailable"}</dd></div>
            <div><dt>Subscription drift</dt><dd>{snapshot.billing.driftedSubscriptions ?? "Unavailable"}</dd></div>
            <div><dt>Failed deletions</dt><dd>{snapshot.deletionJobs.failed ?? "Unavailable"}</dd></div>
            <div><dt>Follow-gated</dt><dd>{snapshot.capabilities.followGatedCampaigns}</dd></div>
          </dl>
          {!snapshot.billing.configured ? <p className="admin-readiness-warning">Razorpay needs configuration</p> : null}
        </aside>
      </div>

      {pending ? (
        <ReasonDialog
          error={error}
          title={commandLabel(pending)}
          warning="This command changes live Linkar runtime state and is recorded in the immutable audit trail."
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
    // Spans the whole queue row grid so the list sits under the queue it belongs to.
    <div className="admin-failed-jobs" style={{ gridColumn: "1 / -1" }} id={`failed-jobs-${list.queue}`} role="region" aria-label={`Failed ${list.queue} jobs`} aria-busy={list.jobs === null}>
      {list.error ? <div className="form-error" role="alert">{list.error}</div> : null}
      {list.jobs === null ? <p className="muted">Loading failed jobs…</p> : null}
      {list.jobs !== null && !list.error && jobs.length === 0 ? <p className="muted">No failed jobs are retained for this queue.</p> : null}
      {jobs.length > 0 ? (
        <>
          <p className="admin-field-hint">Showing the {jobs.length} most recent failed jobs. Retry only failures whose external cause is fixed.</p>
          <label className="admin-check-field">
            <input type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} /> Select all
          </label>
          <ul className="admin-record-list">
            {jobs.map((job) => (
              <li className="admin-record-row" key={job.id}>
                <label className="admin-check-field">
                  <input type="checkbox" checked={list.selected.includes(job.id)} disabled={!list.selected.includes(job.id) && list.selected.length >= MAX_RETRY_BATCH} onChange={(event) => onToggle(job.id, event.target.checked)} aria-label={`Select failed job ${job.id}`} />
                  <span>
                    <strong>{job.name}</strong>
                    <small>{job.id} · {job.code ?? "No failure code"} · {job.attemptsMade} attempt{job.attemptsMade === 1 ? "" : "s"}{job.failedAt ? ` · failed ${formatAdminDateTime(job.failedAt)}` : ""}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="admin-command-actions">
            <button className="button button-secondary button-small" type="button" disabled={list.selected.length === 0} onClick={onRetry}>
              Retry selected ({list.selected.length})
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
