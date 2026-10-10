import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { DataDeletionRequests } from "@/src/components/admin/deletions/data-deletion-requests";
import { listDataDeletionRequests } from "@/src/lib/admin/compliance/repository";

async function Data() {
  const requests = await listDataDeletionRequests();
  return <DataDeletionRequests requests={requests} />;
}

export default function DataDeletionRequestsPage() {
  return <AdminRouteGuard><Data /></AdminRouteGuard>;
}
