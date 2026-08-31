"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Gauge, RadioTower, Server, ShieldCheck } from "lucide-react";
import type { AdminSystemSnapshot } from "@/src/lib/admin/system/types";
import { ReasonDialog } from "../shared/reason-dialog";
import { QueueCard } from "./queue-card";
import { ReconciliationPanel } from "./reconciliation-panel";

type Pending =
  | { type: "queue"; queue: string; action: "pause" | "resume" }
  | { type: "system"; action: "run_delivery_reconciliation" | "run_usage_reconciliation" };

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
        headers: {
          "content-type": "application/json",
          "x-admin-reason": reason,
          "idempotency-key": `admin-${crypto.randomUUID()}`,
        },
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

  return (
    <main className="page-wrap admin-resource-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Linkar operator / infrastructure</p>
          <h1>System command center</h1>
          <p className="muted page-lede">Bounded Linkar health and queue controls. No infrastructure credentials are exposed.</p>
        </div>
        <span className={`admin-release ${snapshot.overall === "healthy" ? "is-ok" : "is-degraded"}`}>
          {snapshot.overall} · {snapshot.release ?? "release unknown"}
        </span>
      </header>
      <p className="admin-snapshot-time">Snapshot {new Date(snapshot.generatedAt).toLocaleString()}{stale ? " · Stale" : ""}</p>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {notice ? <div className="form-success" role="status">{notice}</div> : null}

      <section className="admin-system-grid" aria-label="Runtime probes">
        {probes.map(([name, probe, Icon]) => {
          const label = `${probe.state === "unavailable" ? "Unavailable" : probe.state}${probe.detail ? ` · ${probe.detail}` : ""}`;
          return (
            <article className="panel admin-system-card" key={name}>
              <div className="panel-heading">
                <div><p className="eyebrow">Runtime</p><h2>{name}</h2></div>
                <Icon size={20} />
              </div>
              <p className={`admin-probe-state is-${probe.state}`}>{label}</p>
            </article>
          );
        })}
      </section>

      <section className="admin-system-grid">
        {snapshot.queues.map((queue) => (
          <QueueCard key={queue.name} queue={queue} onAction={(action) => setPending({ type: "queue", queue: queue.name, action })} />
        ))}
        <ReconciliationPanel
          expiredClaims={snapshot.reconciliation.expiredDeliveryClaims}
          onRun={(action) => setPending({ type: "system", action })}
        />
        <article className="panel admin-system-card">
          <div className="panel-heading">
            <div><p className="eyebrow">Configuration</p><h2>Presence checks</h2></div>
            <ShieldCheck size={20} />
          </div>
          <ul className="check-list">
            {snapshot.configurationPresence.map((item) => (
              <li key={item.requirement}><span className={`status-dot is-${item.present ? "ok" : "error"}`} /> {item.requirement}: {item.present ? "Present" : "Missing"}</li>
            ))}
          </ul>
        </article>
        <article className="panel admin-system-card">
          <p className="eyebrow">Workload</p>
          <h2>Application posture</h2>
          <dl className="admin-system-metrics">
            <div><dt>Stuck claims</dt><dd>{snapshot.stuckClaims ?? "—"}</dd></div>
            <div><dt>Webhooks / hour</dt><dd>{snapshot.webhookThroughput.lastHour ?? "—"}</dd></div>
            <div><dt>Deletion queued</dt><dd>{snapshot.deletionJobs.queued ?? "—"}</dd></div>
            <div><dt>Deletion failed</dt><dd>{snapshot.deletionJobs.failed ?? "—"}</dd></div>
          </dl>
        </article>
      </section>

      {pending ? (
        <ReasonDialog
          title={pending.action.replaceAll("_", " ")}
          warning="This command changes live Linkar runtime state and is recorded in the immutable audit trail."
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={execute}
        />
      ) : null}
    </main>
  );
}
