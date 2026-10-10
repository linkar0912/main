import Link from "next/link";

import { describeAuditAction } from "@/src/components/admin/shared/audit-actions";
import { humanizeAdminCode } from "@/src/components/admin/shared/admin-request";
import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import { StatusBadge, type StatusTone } from "@/src/components/ui/status-badge";
import type { AdminOperatorTapeItem, AdminOverviewDTO } from "@/src/lib/admin/overview";

type HealthState = AdminOverviewDTO["health"]["database"] | AdminOverviewDTO["health"]["instagram"];

function healthBadge(state: HealthState): { tone: StatusTone; label: string } {
  if (state === "ok") return { tone: "success", label: "Healthy" };
  if (state === "configured") return { tone: "success", label: "Set up" };
  if (state === "not_configured") return { tone: "neutral", label: "Not set up" };
  return { tone: "danger", label: "Down" };
}

const activityTone: Record<AdminOperatorTapeItem["status"], StatusTone> = { success: "success", failed: "danger", attempt: "neutral" };

function activityTitle(item: AdminOperatorTapeItem): string {
  return item.kind === "failure" ? "A message failed to send" : describeAuditAction(item.title);
}

function activityDetail(item: AdminOperatorTapeItem): string {
  // Failures carry a provider result code such as PROVIDER_REJECTED.
  if (item.kind === "failure") return /^[A-Z][A-Z0-9_]+$/.test(item.detail) ? `Reason: ${humanizeAdminCode(item.detail.toLowerCase())}` : item.detail;
  return item.detail;
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="admin-stat">
      <span>{label}</span>
      <strong>{value.toLocaleString("en-IN")}</strong>
      <small>{note}</small>
    </div>
  );
}

export function AdminOverviewScreen({ overview }: { overview: AdminOverviewDTO }) {
  const connectionTotal = overview.connections.instagram + overview.connections.facebook;
  const queueDepth = overview.queue.waiting + overview.queue.active + overview.queue.delayed;
  // Counts are zero-filled when the queue cannot be read; do not present that as an empty queue.
  const queueKnown = overview.queue.state === "ok";
  const healthy = overview.health.status === "ok";
  const services = [
    ["Database", overview.health.database],
    ["Job queue (Redis)", overview.health.redis],
    ["Instagram app", overview.health.instagram],
    ["Facebook app", overview.health.facebook],
  ] as const;

  return (
    <main className="page-wrap admin-page">
      <PageHeader
        title="Overview"
        description="Everything across Linkar right now."
        actions={(
          <>
            <StatusBadge tone={healthy ? "success" : "warning"} label={healthy ? "All systems healthy" : "Needs attention"} />
            {overview.health.release ? <IdChip id={overview.health.release} prefix="Version" /> : <span className="admin-hint">Version unknown</span>}
          </>
        )}
      />

      <section className="admin-stats" aria-label="Platform totals">
        <Stat label="Active workspaces" value={overview.workspaces.active} note={overview.workspaces.suspended ? `${overview.workspaces.suspended} suspended` : "None suspended"} />
        <Stat label="Active users" value={overview.users.active} note="People with workspace access" />
        <Stat label="Connected accounts" value={connectionTotal} note={`${overview.connections.instagram} Instagram, ${overview.connections.facebook} Facebook`} />
        <Stat label="Live automations" value={overview.automations.active} note="Across every workspace" />
      </section>

      <div className="admin-columns is-wide-left">
        <section className="admin-card is-flush" aria-labelledby="activity-heading">
          <div className="admin-card-head">
            <div>
              <h2 id="activity-heading">Recent activity</h2>
              <p>Admin actions and failed messages, newest first.</p>
            </div>
            <Link className="button button-ghost button-small" href="/admin/audit">Open audit log</Link>
          </div>
          {overview.operatorTape.length === 0 ? (
            <div className="admin-empty">
              <p>No recent activity. Admin actions and failed messages will show up here.</p>
            </div>
          ) : (
            <ol className="admin-activity">
              {overview.operatorTape.map((item) => (
                <li key={item.id}>
                  <span className={`admin-activity-dot is-${activityTone[item.status]}`} aria-hidden />
                  <div className="admin-activity-body">
                    <strong>{activityTitle(item)}</strong>
                    {item.detail ? <p>{activityDetail(item)}</p> : null}
                    <div className="cell-meta">
                      {item.workspaceId ? (
                        item.workspaceName
                          ? <Link href={`/admin/workspaces/${item.workspaceId}`}>{item.workspaceName}</Link>
                          : <IdChip id={item.workspaceId} prefix="Workspace" />
                      ) : null}
                      {item.actor ? <span>by {item.actor}</span> : null}
                      {item.kind === "audit" && item.status !== "success" ? <StatusBadge tone={activityTone[item.status]} label={item.status === "failed" ? "Failed" : "Started"} /> : null}
                    </div>
                  </div>
                  <RelativeTime value={item.at} className="admin-activity-time" />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="admin-card" aria-labelledby="health-heading">
          <div className="admin-card-head">
            <div>
              <h2 id="health-heading">Service health</h2>
              <p>The systems Linkar depends on.</p>
            </div>
          </div>
          <ul className="admin-health-list">
            {services.map(([name, state]) => {
              const badge = healthBadge(state);
              return (
                <li key={name}>
                  <span>{name}</span>
                  <StatusBadge tone={badge.tone} label={badge.label} />
                </li>
              );
            })}
          </ul>
          <dl className="admin-kv">
            <div><dt>Jobs in progress</dt><dd>{queueKnown ? queueDepth.toLocaleString("en-IN") : "Unknown"}</dd></div>
            <div><dt>Failed jobs</dt><dd>{queueKnown ? overview.queue.failed.toLocaleString("en-IN") : "Unknown"}</dd></div>
          </dl>
          {!queueKnown ? <p className="admin-hint">{overview.queue.state === "not_configured" ? "The job queue is not set up, so job counts are not available." : "The job queue could not be reached, so job counts are unknown."}</p> : null}
          <div className="admin-actions">
            <Link className="button button-secondary button-small" href="/admin/system">Open service health</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
