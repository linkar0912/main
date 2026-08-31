import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { PlansScreen } from "@/src/components/admin/plans-screen";
import { listAdminPlans } from "@/src/lib/admin/plan-service";
async function PlansData() { return <PlansScreen plans={await listAdminPlans()} />; }
export default function AdminPlansPage() { return <AdminRouteGuard><PlansData /></AdminRouteGuard>; }
