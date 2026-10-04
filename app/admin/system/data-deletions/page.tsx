import Link from "next/link";

import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { formatAdminDateTime } from "@/src/components/admin/shared/date-format";
import { StatusPill } from "@/src/components/admin/shared/status-pill";
import { listDataDeletionRequests } from "@/src/lib/admin/compliance/repository";

async function Data() {
  const requests = await listDataDeletionRequests();
  return (
    <main className="page-wrap admin-resource-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Linkar operator / compliance</p>
          <h1>Provider data-deletion requests</h1>
          <p className="muted page-lede">Safe status projection. Signed requests and confirmation codes are never displayed.</p>
        </div>
        <Link className="button button-secondary" href="/admin/deletions">Permanent deletion jobs</Link>
      </header>
      <section className="panel admin-table-panel" aria-label="Provider deletion requests">
        {requests.length === 0 ? (
          <div className="empty-state">
            <h2>No provider deletion requests</h2>
            <p>Requests sent by Meta on behalf of a user will be listed here.</p>
          </div>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead><tr><th>Request</th><th>Status</th><th>Requested</th><th>Completed</th></tr></thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.id}</td>
                    <td><StatusPill status={request.status} /></td>
                    <td>{formatAdminDateTime(request.requestedAt)}</td>
                    <td>{request.completedAt ? formatAdminDateTime(request.completedAt) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default function DataDeletionRequestsPage() {
  return <AdminRouteGuard><Data /></AdminRouteGuard>;
}
