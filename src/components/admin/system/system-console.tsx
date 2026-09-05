"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CircleCheck, CircleX, Database, Gauge, RadioTower, Server } from "lucide-react";

import type { AdminSystemSnapshot } from "@/src/lib/admin/system/types";
import { ReasonDialog } from "../shared/reason-dialog";
import { IncidentTable } from "./incident-table";

type Pending =
  | { type: "queue"; queue: string; action: "pause" | "resume" }
  | { type: "system"; action: "run_delivery_reconciliation" | "run_usage_reconciliation" };

function probeLabel(state: string, detail?: string): string {
  const label = state === "unavailable" ? "Unavailable" : state;
  return `${label}${detail ? ` · ${detail}` : ""}`;
}

export function SystemConsole({ snapshot }: { snapshot: AdminSystemSnapshot }) {
  const router = useRouter();
  const [renderedAt] = useState(Date.now);
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

  async function execute(reason: string) {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const url = pending.type === "queue" ? `/api/admin/system/queues/${pending.queue}` : "/api/admin/system";
      const response = await fetch(url, {
        method: pending.type === "queue" ? "PATCH" : "POST",
        headers: { "content-type": "application/json", "x-admin-reason": reason, "idempotency-key": `admin-${crypto.randomUUID()}` },
        body: JSON.stringify({ action: pending.action }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "system_command_failed");
      setNotice(`${pending.action.replaceAll("_", " ")} accepted`);
      setPending(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "System command failed");
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

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {notice ? <div className="form-success" role="status">{notice}</div> : null}

      <section className="panel admin-ops-summary" aria-label="Production status summary">
        <div className="admin-ops-primary">
          <span className={`admin-ops-signal is-${activeIncidents > 0 ? "attention" : "healthy"}`} aria-hidden>
            {activeIncidents > 0 ? <CircleX size={22} /> : <CircleCheck size={22} />}
          </span>
          <div><strong>{activeIncidents > 0 ? activeLabel : "No active incidents"}</strong><small>Snapshot {new Date(snapshot.generatedAt).toLocaleString()}{stale ? " · Stale" : ""}</small></div>
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

      <IncidentTable incidents={snapshot.incidents} now={new Date(renderedAt).toISOString()} />

      <div className="admin-system-layout">
        <section className="panel admin-operations-panel" aria-labelledby="queue-heading">
          <div className="admin-section-heading"><div><h2 id="queue-heading">Queue operations</h2><p>Live workload and bounded operator controls.</p></div></div>
          {snapshot.queues.map((queue) => (
            <div className="admin-queue-row" key={queue.name}>
              <div className="admin-queue-name"><strong>{queue.name}</strong><span>{!queue.configured ? "Unavailable" : queue.paused ? "Paused" : "Running"}</span></div>
              <dl>
                <div><dt>Waiting</dt><dd>{queue.waiting}</dd></div>
                <div><dt>Active</dt><dd>{queue.active}</dd></div>
                <div><dt>Delayed</dt><dd>{queue.delayed}</dd></div>
                <div><dt>Failed</dt><dd>{queue.failed}</dd></div>
              </dl>
              <div className="admin-queue-action">
                {queue.lastFailedCode ? <small>Latest failure: <code>{queue.lastFailedCode}</code></small> : <small>No recorded failures</small>}
                <button className="button button-secondary button-small" disabled={!queue.configured} type="button" onClick={() => setPending({ type: "queue", queue: queue.name, action: queue.paused ? "resume" : "pause" })}>{queue.paused ? "Resume queue" : "Pause queue"}</button>
              </div>
            </div>
          ))}
          <div className="admin-maintenance-row">
            <div><strong>Reconciliation</strong><small>{snapshot.reconciliation.expiredDeliveryClaims === null ? "Expired claim count unavailable" : `${snapshot.reconciliation.expiredDeliveryClaims} expired delivery claims`}</small></div>
            <div className="admin-command-actions">
              <button className="button button-secondary button-small" onClick={() => setPending({ type: "system", action: "run_delivery_reconciliation" })}>Reconcile deliveries</button>
              <button className="button button-secondary button-small" onClick={() => setPending({ type: "system", action: "run_usage_reconciliation" })}>Reconcile usage</button>
            </div>
          </div>
        </section>

        <aside className="panel admin-posture-panel" aria-labelledby="posture-heading">
          <div className="admin-section-heading"><div><h2 id="posture-heading">Readiness</h2><p>Presence checks only. Values stay secret.</p></div></div>
          <ul className="admin-readiness-list">
            {snapshot.configurationPresence.map((item) => (
              <li key={item.requirement}><span className={`health-orb`} data-state={item.present ? "ok" : "warn"} aria-hidden /><span>{item.requirement}</span><strong>{item.present ? "Ready" : "Missing"}</strong></li>
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

      {pending ? <ReasonDialog title={pending.action.replaceAll("_", " ")} warning="This command changes live Linkar runtime state and is recorded in the immutable audit trail." busy={busy} onCancel={() => setPending(null)} onConfirm={execute} /> : null}
    </main>
  );
}
