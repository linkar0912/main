import Link from "next/link";

import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { SystemConsole } from "@/src/components/admin/system/system-console";
import { getAdminSystemService } from "@/src/lib/admin/system/service";

async function Data() {
  return (
    <>
      <nav className="admin-system-links" aria-label="Data lifecycle">
        <Link className="button button-secondary button-small" href="/admin/deletions">Permanent deletion</Link>
        <Link className="button button-secondary button-small" href="/admin/system/data-deletions">Provider deletion requests</Link>
      </nav>
      <SystemConsole snapshot={await getAdminSystemService().snapshot()} />
    </>
  );
}

export default function SystemPage() {
  return <AdminRouteGuard><Data /></AdminRouteGuard>;
}
