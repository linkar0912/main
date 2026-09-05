import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { PlansScreen } from "@/src/components/admin/plans-screen";
import { listAdminPlans } from "@/src/lib/admin/plan-service";
import { getPremiumInviteService } from "@/src/lib/billing/premium-invite";
async function PlansData() { const [plans, inviteCodes] = await Promise.all([listAdminPlans(), getPremiumInviteService().list()]); return <PlansScreen plans={plans} inviteCodes={inviteCodes} />; }
export default function AdminPlansPage() { return <AdminRouteGuard><PlansData /></AdminRouteGuard>; }
