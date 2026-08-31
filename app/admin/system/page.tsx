import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { SystemConsole } from "@/src/components/admin/system/system-console";
import { getAdminSystemService } from "@/src/lib/admin/system/service";
async function Data() { return <SystemConsole snapshot={await getAdminSystemService().snapshot()} />; }
export default function SystemPage() { return <AdminRouteGuard><Data /></AdminRouteGuard>; }
