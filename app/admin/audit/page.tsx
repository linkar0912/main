import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { AuditConsole } from "@/src/components/admin/audit/audit-console";
import { listAdminAuditEvents } from "@/src/lib/admin/audit/repository";

async function Data({ searchParams }: PageProps<"/admin/audit">) {
  const params = await searchParams;
  const filters = {
    actor: typeof params.actor === "string" ? params.actor : "",
    action: typeof params.action === "string" ? params.action : "",
    phase: typeof params.phase === "string" ? params.phase : "",
  };
  const data = await listAdminAuditEvents({
    ...filters,
    phase: filters.phase as "ATTEMPT" | "SUCCESS" | "FAILURE" || undefined,
    cursor: typeof params.cursor === "string" ? params.cursor : null,
  });
  const next = data.nextCursor ? `/admin/audit?${new URLSearchParams({ ...filters, cursor: data.nextCursor }).toString()}` : null;
  return <AuditConsole events={data.items} nextHref={next} filters={filters} />;
}

export default function AdminAuditPage(props: PageProps<"/admin/audit">) {
  return <AdminRouteGuard><Data {...props} /></AdminRouteGuard>;
}
