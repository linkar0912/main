"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CircleCheck, CircleX, Database, Gauge, RadioTower, Server } from "lucide-react";

import { formatAdminDateTime } from "@/src/components/admin/shared/date-format";
import type { AdminSystemSnapshot } from "@/src/lib/admin/system/types";
import { adminCommand, adminErrorMessage } from "../shared/admin-request";
import { ReasonDialog } from "../shared/reason-dialog";
import { IncidentTable } from "./incident-table";

type Pending =
  | { type: "queue"; queue: string; action: "pause" | "resume" }
  | { type: "system"; action: "run_delivery_reconciliation" | "run_usage_reconciliation" };

function commandLabel(pending: Pending): string {
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

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !pending) router.refresh();
    }, 20_000);
    return () => clearInterval(timer);
  }, [pending, router]);

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
      const url = pending.type === "queue" ? `/api/admin/system/queues/${pending.queue}` : "/api/admin/system";
      await adminCommand(url, { method: pending.type === "queue" ? "PATCH" : "POST", body: { action: pending.action }, reason, fallback: "system_command_failed" });
      setNotice(`${commandLabel(pending)} accepted`);
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
                  <button className="button button-secondary button-small" disabled={state === "unavailable"} type="button" onClick={() => openCommand({ type: "queue", queue: queue.name, action: queue.paused ? "resume" : "pause" })}>{queue.paused ? "Resume queue" : "Pause queue"}</button>
                </div>
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
