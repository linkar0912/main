"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Gauge, RadioTower, Server } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import { StatusBadge, type StatusTone } from "@/src/components/ui/status-badge";
import { splitByStatus, StatusSummary } from "@/src/components/ui/status-summary";
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

// What each command does, in one sentence, and the button that does it.
function commandCopy(pending: Pending): { intro: string; confirm: string } {
  if (pending.type === "retry") {
    return { intro: "Runs the selected jobs again. Only retry the ones whose cause is fixed, or they will fail again.", confirm: `Retry ${pending.jobIds.length === 1 ? "job" : `${pending.jobIds.length} jobs`}` };
  }
  if (pending.type === "queue") {
    return pending.action === "pause"
      ? { intro: "Nothing in this queue runs until you resume it. Work already waiting is kept.", confirm: "Pause queue" }
      : { intro: "Work waiting in this queue starts running again straight away.", confirm: "Resume queue" };
  }
  return pending.action === "run_delivery_reconciliation"
    ? { intro: "Finds message sends that stopped without a result from Meta and marks their outcome unknown, so they are never sent twice.", confirm: "Re-check stuck sends" }
    : { intro: "Recounts every workspace's messages and broadcasts this month against its plan limits.", confirm: "Recount plan usage" };
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

const probeFixes: Record<string, string> = {
  "Web app": "Check the web server's logs and the latest deploy.",
  Database: "Check that the database is running and reachable from the web server.",
  "Job queue (Redis)": "Check that Redis is running and REDIS_URL is set on the web server and the worker.",
  "Background worker": "Check that the worker process is running and on the same version as the web app.",
};

function count(value: number | null | undefined): string {
  return value === null || value === undefined ? "Unknown" : value.toLocaleString("en-IN");
}

function plural(value: number, one: string, many: string): string {
  return `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;
}

export type ServiceProblem = { tone: "warning" | "danger"; title: string; fix: string; href: string };

// Where each problem's link goes, named for the section it opens.
const PROBLEM_LINKS: Record<string, string> = {
  "#services": "View services",
  "#incidents": "View incidents",
  "#jobs": "View background jobs",
  "#setup": "View setup checklist",
  "/admin/deletions": "Open Delete data",
};

/**
 * Everything on this page that needs the owner, in one list, each with what
 * to do and where to do it. An empty list means "All systems normal". Failed
 * jobs alone are routine churn, so they show in Background jobs, not here.
 */
export function serviceProblems(snapshot: AdminSystemSnapshot): ServiceProblem[] {
  const problems: ServiceProblem[] = [];
  const probes = [["Web app", snapshot.web], ["Database", snapshot.database], ["Job queue (Redis)", snapshot.redis], ["Background worker", snapshot.worker]] as const;
  for (const [name, probe] of probes) {
    if (probe.state === "healthy") continue;
    problems.push({
      tone: probe.state === "unavailable" ? "danger" : "warning",
      title: probe.state === "unavailable" ? `${name} is down` : `${name} needs attention`,
      fix: `${probe.detail ? `${probe.detail.replace(/\.$/, "")}. ` : ""}${probeFixes[name]}`,
      href: "#services",
    });
  }
  if (snapshot.operationalDataAvailable === false) {
    problems.push({ tone: "warning", title: "Incident and workload numbers could not be loaded", fix: "The database query for them failed or timed out. Check the database, then reload this page.", href: "#incidents" });
  }
  for (const incident of snapshot.incidents) {
    if (incident.status === "RESOLVED") continue;
    problems.push({ tone: incident.severity === "CRITICAL" ? "danger" : "warning", title: incident.title, fix: incident.detail, href: "#incidents" });
  }
  for (const queue of snapshot.queues) {
    if (!queue.configured || queue.paused === null) {
      problems.push({ tone: "danger", title: `${queueName(queue.name)} queue can't be reached`, fix: "Check that Redis is running and REDIS_URL is set.", href: "#jobs" });
    } else if (queue.paused) {
      problems.push({ tone: "warning", title: `${queueName(queue.name)} queue is paused`, fix: "Nothing in it runs until it is resumed. Resume it once the cause is fixed.", href: "#jobs" });
    }
  }
  const stuck = Math.max(snapshot.stuckClaims ?? 0, snapshot.reconciliation.expiredDeliveryClaims ?? 0);
  if (stuck > 0) {
    problems.push({ tone: "warning", title: `${plural(stuck, "message send", "message sends")} stopped without a result`, fix: "Use Re-check stuck sends under Background jobs.", href: "#jobs" });
  }
  for (const item of snapshot.configurationPresence) {
    if (item.present) continue;
    problems.push({ tone: "warning", title: `${item.requirement} ${item.requirement.endsWith("s") ? "are" : "is"} not set up`, fix: item.fix ?? "Add its settings on the web server, then redeploy.", href: "#setup" });
  }
  if (!snapshot.billing.configured && !snapshot.configurationPresence.some((item) => !item.present && /razorpay/i.test(item.requirement))) {
    problems.push({ tone: "warning", title: "Razorpay billing is not set up", fix: "Customers cannot pay for plans until its keys and plan IDs are set on the web server.", href: "#setup" });
  }
  if ((snapshot.billing.failedWebhooksLastHour ?? 0) > 0) {
    problems.push({ tone: "warning", title: `${plural(snapshot.billing.failedWebhooksLastHour ?? 0, "billing update", "billing updates")} from Razorpay failed in the last hour`, fix: "Check the webhook deliveries in the Razorpay dashboard; Razorpay retries failed ones.", href: "#setup" });
  }
  if ((snapshot.billing.driftedSubscriptions ?? 0) > 0) {
    problems.push({ tone: "warning", title: `${plural(snapshot.billing.driftedSubscriptions ?? 0, "subscription needs", "subscriptions need")} attention`, fix: "Their plan in Linkar no longer matches Razorpay. Check them in Razorpay, then use Recount plan usage.", href: "#setup" });
  }
  if ((snapshot.deletionJobs.failed ?? 0) > 0) {
    problems.push({ tone: "danger", title: `${plural(snapshot.deletionJobs.failed ?? 0, "permanent deletion", "permanent deletions")} failed`, fix: "Open Delete data to see why and retry.", href: "/admin/deletions" });
  }
  // Outages before warnings; otherwise keep the page's top-to-bottom order.
  return [...problems.filter((problem) => problem.tone === "danger"), ...problems.filter((problem) => problem.tone === "warning")];
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
  const problems = serviceProblems(snapshot);
  const loud = problems.some((problem) => problem.tone === "danger") ? "danger" : "warning";
  const { exceptions: missingSettings, normal: readySettings } = splitByStatus(snapshot.configurationPresence, (item) => item.present);

  return (
    <main className="page-wrap admin-page">
      <PageHeader
        title="Service health"
        description="How Linkar's servers, background jobs and settings are doing right now."
      />

      {notice ? <div className="form-success admin-message" role="status">{notice}</div> : null}

      <section className={`health-banner ${problems.length ? `is-${loud}` : "is-normal"}`} aria-labelledby="health-banner-title">
        <div className="health-banner-head">
          <h2 id="health-banner-title">
            {problems.length === 0
              ? <StatusBadge tone="success" label="All systems normal" />
              : <StatusBadge tone={loud} label={`${problems.length} ${problems.length === 1 ? "thing needs" : "things need"} attention`} />}
          </h2>
          <div className="health-banner-meta">
            <span>Checked <RelativeTime inline value={snapshot.generatedAt} /></span>
            {snapshot.release ? <IdChip id={snapshot.release} prefix="Version" /> : null}
          </div>
        </div>
        {stale ? <p className="admin-hint">This page may be out of date; it refreshes every 20 seconds.</p> : null}
        {problems.length ? (
          <ul className="health-problems">
            {problems.map((problem) => (
              <li key={`${problem.href}-${problem.title}`} className={`is-${problem.tone}`}>
                <span className="health-problem-dot" aria-hidden />
                <div>
                  <strong>{problem.title}</strong>
                  <p>{problem.fix}</p>
                </div>
                <a className="text-link" href={problem.href} aria-label={`${PROBLEM_LINKS[problem.href]}: ${problem.title}`}>{PROBLEM_LINKS[problem.href]}</a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section id="services" className="health-services" aria-label="Services">
        {probes.map(([name, probe, Icon]) => (
          <div className={`health-service is-${probe.state}`} key={name}>
            <span className="health-service-name"><Icon size={18} aria-hidden /> {name}</span>
            <StatusBadge tone={probeBadges[probe.state].tone} label={probeBadges[probe.state].label} />
            {probe.detail ? <p>{probe.detail}</p> : null}
            {probe.lastSeenAt ? <p>Checked in <RelativeTime inline value={probe.lastSeenAt} /></p> : null}
            {probe.release && probe.release !== snapshot.release ? <IdChip id={probe.release} prefix="Version" /> : null}
          </div>
        ))}
      </section>

      {snapshot.operationalDataAvailable === false
        ? <p id="incidents" className="admin-callout" role="status">Incident and workload counts are unavailable because operational data could not be loaded.</p>
        : <IncidentTable incidents={snapshot.incidents} now={new Date(renderedAt).toISOString()} />}

      <div className="admin-columns is-wide-left">
        <section id="jobs" className="admin-card is-flush" aria-labelledby="queue-heading">
          <div className="admin-card-head">
            <div>
              <h2 id="queue-heading">Background jobs</h2>
              <p>Work waiting to run, and controls to pause or retry it. {count(snapshot.webhookThroughput.lastHour)} Meta events came in during the last hour.</p>
            </div>
          </div>
          {snapshot.queues.map((queue) => {
            const state = queueState(queue);
            const shown = (value: number) => state === "unavailable" ? "–" : value.toLocaleString("en-IN");
            const failing = state !== "unavailable" && queue.failed > 0;
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
                  <div className={failing ? "is-failing" : undefined}><dt>Failed</dt><dd>{shown(queue.failed)}</dd></div>
                </dl>
                {queue.lastFailedCode
                  ? <p className="admin-hint">Latest failure: {humanizeAdminCode(queue.lastFailedCode.toLowerCase())}</p>
                  : state === "unavailable" ? <p className="admin-hint">Failure history unavailable</p> : null}
                <div className="admin-actions">
                  <button className="button button-secondary button-small" disabled={state === "unavailable"} type="button" onClick={() => openCommand({ type: "queue", queue: queue.name, action: queue.paused ? "resume" : "pause" })}>{queue.paused ? "Resume queue" : "Pause queue"}</button>
                  {failing ? (
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

        <aside id="setup" className="admin-card is-flush" aria-labelledby="posture-heading">
          <div className="admin-card-head">
            <div>
              <h2 id="posture-heading">Setup checklist</h2>
              <p>Settings Linkar needs on the server. Values stay secret; only whether each is set is checked.</p>
            </div>
          </div>
          <div className="admin-setup">
            {missingSettings.length ? (
              <ul className="admin-readiness">
                {missingSettings.map((item) => (
                  <li key={item.requirement}>
                    <span className="admin-readiness-row">
                      <span>{item.requirement}</span>
                      <StatusBadge tone="warning" label="Missing" />
                    </span>
                    {item.fix ? <span className="admin-hint">{item.fix}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {readySettings.length ? (
              <StatusSummary label={missingSettings.length ? `All ${readySettings.length} other settings ready` : `All ${readySettings.length} settings ready`}>
                <ul className="admin-readiness is-ready">
                  {readySettings.map((item) => (
                    <li key={item.requirement}>
                      <span className="admin-readiness-row">
                        <span>{item.requirement}</span>
                        <StatusBadge tone="success" label="Ready" />
                      </span>
                    </li>
                  ))}
                </ul>
              </StatusSummary>
            ) : null}
          </div>
          {!snapshot.billing.configured && !missingSettings.some((item) => /razorpay/i.test(item.requirement)) ? <p className="admin-callout admin-card-note">Razorpay billing is not set up, so customers cannot pay for plans.</p> : null}
          <dl className="admin-kv admin-card-kv">
            <div><dt>Failed billing updates (last hour)</dt><dd>{count(snapshot.billing.failedWebhooksLastHour)}</dd></div>
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
          intro={commandCopy(pending).intro}
          confirmLabel={commandCopy(pending).confirm}
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
