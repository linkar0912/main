import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import { StatusPill } from "../shared/status-pill";

type DataDeletionRequest = { id: string; status: string; requestedAt: Date | string; completedAt: Date | string | null };

function iso(value: Date | string | null): string | null {
  return value instanceof Date ? value.toISOString() : value;
}

/** Deletion requests Meta sends when someone removes Linkar from their Facebook settings. */
export function DataDeletionRequests({ requests }: { requests: DataDeletionRequest[] }) {
  return (
    <main className="page-wrap admin-page">
      <PageHeader
        back={<Link className="admin-back" href="/admin/deletions"><ArrowLeft size={16} aria-hidden /> Delete data</Link>}
        title="Meta deletion requests"
        description="Requests Meta sends when someone removes Linkar from their Facebook or Instagram settings."
      />
      <section className="admin-section" aria-label="Provider deletion requests">
        <div className="admin-results"><span>{requests.length ? `Showing the latest ${requests.length} ${requests.length === 1 ? "request" : "requests"}` : "No requests to show"}</span></div>
        <div className="admin-card is-flush">
          {requests.length === 0 ? (
            <div className="admin-empty">
              <p>No deletion requests from Meta yet. They appear here when someone asks Meta to remove their Linkar data.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table is-stackable">
                <thead><tr><th>Request</th><th>Status</th><th>Received</th><th>Completed</th></tr></thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <td><span className="cell-stack"><strong>Data deletion</strong><IdChip id={request.id} /></span></td>
                      <td data-label="Status"><StatusPill status={request.status} /></td>
                      <td data-label="Received"><RelativeTime value={iso(request.requestedAt)} /></td>
                      <td data-label="Completed"><RelativeTime value={iso(request.completedAt)} fallback="Not yet" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="admin-hint">Signed requests and confirmation codes are never shown here.</p>
      </section>
    </main>
  );
}
