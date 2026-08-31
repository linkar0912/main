import Link from "next/link";
import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { listDataDeletionRequests } from "@/src/lib/admin/compliance/repository";

async function Data() {
  const requests = await listDataDeletionRequests();
  return <main className="page-wrap admin-resource-page">
    <header className="page-header"><div><p className="eyebrow">Linkar operator / compliance</p><h1>Provider data-deletion requests</h1><p className="muted page-lede">Safe status projection. Signed requests and confirmation codes are never displayed.</p></div><Link className="button button-secondary" href="/admin/deletions">Permanent deletion jobs</Link></header>
    <section className="panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Request</th><th>Status</th><th>Requested</th><th>Completed</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td>{request.id}</td><td>{request.status}</td><td>{request.requestedAt.toLocaleString()}</td><td>{request.completedAt?.toLocaleString() ?? "—"}</td></tr>)}{requests.length === 0 ? <tr><td colSpan={4}>No provider deletion requests.</td></tr> : null}</tbody></table></div></section>
  </main>;
}

export default function DataDeletionRequestsPage() { return <AdminRouteGuard><Data /></AdminRouteGuard>; }
