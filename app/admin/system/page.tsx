import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { SystemConsole } from "@/src/components/admin/system/system-console";
import { getAdminSystemService } from "@/src/lib/admin/system/service";
import Link from "next/link";
async function Data() { return <><div className="admin-system-links"><Link className="button button-secondary" href="/admin/deletions">Permanent deletion</Link><Link className="button button-secondary" href="/admin/system/data-deletions">Provider deletion requests</Link></div><SystemConsole snapshot={await getAdminSystemService().snapshot()} /></>; }
export default function SystemPage() { return <AdminRouteGuard><Data /></AdminRouteGuard>; }
