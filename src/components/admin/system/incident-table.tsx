import { RelativeTime } from "@/src/components/ui/relative-time";
import { StatusBadge, type StatusTone } from "@/src/components/ui/status-badge";
import type { AdminIncidentSummary } from "@/src/lib/admin/system/types";

function durationLabel(incident: AdminIncidentSummary, now: string): string {
  const start = Date.parse(incident.firstSeenAt);
  const end = incident.resolvedAt ? Date.parse(incident.resolvedAt) : Date.parse(now);
  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  return `${duration} ${incident.status === "RESOLVED" ? "total" : "active"}`;
}

function state(incident: AdminIncidentSummary): { tone: StatusTone; label: string } {
  if (incident.status === "RESOLVED") return { tone: "success", label: "Recovered" };
  if (incident.status === "ACKNOWLEDGED") return { tone: "warning", label: "Acknowledged" };
  return incident.severity === "CRITICAL" ? { tone: "danger", label: "Critical" } : { tone: "warning", label: "Warning" };
}

// Incident sources are internal keys such as "component:database" or "queue:webhooks".
const SOURCES: Record<string, string> = {
  billing: "Billing",
  "component:database": "Database",
  "component:redis": "Job queue (Redis)",
  "component:worker": "Background worker",
  "component:web": "Web app",
  "queue:webhooks": "Incoming events queue",
  "queue:bulk": "Bulk sends queue",
};

export function incidentSource(source: string): string {
  if (SOURCES[source]) return SOURCES[source];
  const text = source.split(":").at(-1)?.replaceAll(/[_-]/g, " ") ?? source;
  return `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;
}

export function IncidentTable({ incidents, now }: { incidents: AdminIncidentSummary[]; now: string }) {
  // A quiet day is one line, not an empty table.
  if (incidents.length === 0) {
    return (
      <section id="incidents" className="health-incidents-none" aria-label="Incidents">
        <StatusBadge tone="success" label="No incidents in the last 24 hours" />
      </section>
    );
  }
  const active = incidents.filter((incident) => incident.status !== "RESOLVED").length;
  const recovered = incidents.length - active;
  const summary = [
    active ? `${active} active ${active === 1 ? "incident" : "incidents"}` : "",
    recovered ? `${recovered} recovered in the last 24 hours` : "",
  ].filter(Boolean).join(", ");
  return (
    <section id="incidents" className="admin-card is-flush" aria-labelledby="incident-heading">
      <div className="admin-card-head">
        <div>
          <h2 id="incident-heading">Incidents</h2>
          <p>{summary}</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table is-stackable" aria-label="Production incidents">
          <thead><tr><th>State</th><th>What happened</th><th>Affects</th><th>Duration</th><th>Last seen</th></tr></thead>
          <tbody>
            {incidents.map((incident) => {
              const badge = state(incident);
              return (
                <tr key={incident.id}>
                  <td data-label="State"><StatusBadge tone={badge.tone} label={badge.label} /></td>
                  <td><span className="cell-stack"><strong>{incident.title}</strong><span className="cell-meta">{incident.detail}</span></span></td>
                  <td data-label="Affects">{incidentSource(incident.source)}</td>
                  <td data-label="Duration">{durationLabel(incident, now)}</td>
                  <td data-label="Last seen"><RelativeTime value={incident.lastSeenAt} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
