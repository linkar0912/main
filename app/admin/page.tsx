import { AdminOverviewScreen } from "@/src/components/admin/admin-overview-screen";
import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { loadAdminOverview } from "@/src/lib/admin/overview";

async function OverviewData() {
  return <AdminOverviewScreen overview={await loadAdminOverview()} />;
}

export default function AdminOverviewPage() {
  return <AdminRouteGuard><OverviewData /></AdminRouteGuard>;
}
