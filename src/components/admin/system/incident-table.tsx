import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";

import type { AdminIncidentSummary } from "@/src/lib/admin/system/types";

function durationLabel(incident: AdminIncidentSummary, now: string): string {
  const start = Date.parse(incident.firstSeenAt);
  const end = incident.resolvedAt ? Date.parse(incident.resolvedAt) : Date.parse(now);
  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  return `${duration} ${incident.status === "RESOLVED" ? "total" : "active"}`;
}

function stateLabel(incident: AdminIncidentSummary): string {
  if (incident.status === "RESOLVED") return "Recovered";
  if (incident.status === "ACKNOWLEDGED") return "Acknowledged";
  return incident.severity === "CRITICAL" ? "Critical" : "Warning";
}

export function IncidentTable({ incidents, now }: { incidents: AdminIncidentSummary[]; now: string }) {
  return (
    <section className="panel admin-incident-panel" aria-labelledby="incident-heading">
      <div className="admin-section-heading">
        <div>
          <h2 id="incident-heading">Incidents</h2>
          <p>Active problems and recoveries from the last 24 hours.</p>
        </div>
        <span className="admin-inline-count">{incidents.length} recorded</span>
      </div>
      <div className="admin-table-scroll">
        <table className="admin-table admin-incident-table" aria-label="Production incidents">
          <thead><tr><th>State</th><th>Incident</th><th>Service</th><th>Duration</th><th>Last seen</th></tr></thead>
          <tbody>
            {incidents.length === 0 ? (
              <tr><td colSpan={5} className="admin-incident-empty"><CheckCircle2 size={18} aria-hidden /> No incidents in the last 24 hours</td></tr>
            ) : incidents.map((incident) => {
              const recovered = incident.status === "RESOLVED";
              const Icon = recovered ? CheckCircle2 : incident.severity === "CRITICAL" ? CircleAlert : AlertTriangle;
              return (
                <tr key={incident.id} className={`is-${recovered ? "recovered" : incident.severity.toLowerCase()}`}>
                  <td data-label="State"><span className={`admin-incident-state is-${recovered ? "recovered" : incident.severity.toLowerCase()}`}><Icon size={14} aria-hidden />{stateLabel(incident)}</span></td>
                  <td data-label="Incident"><strong>{incident.title}</strong><small>{incident.detail}</small></td>
                  <td data-label="Service"><code>{incident.source}</code></td>
                  <td data-label="Duration">{durationLabel(incident, now)}</td>
                  <td data-label="Last seen"><time dateTime={incident.lastSeenAt}>{new Date(incident.lastSeenAt).toLocaleString()}</time></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
