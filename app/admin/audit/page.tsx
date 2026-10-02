import Link from "next/link";
import { AuditFilterSchema } from "@/src/lib/admin/audit/query-schema";
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
  const validated = AuditFilterSchema.safeParse({
    ...filters,
    phase: filters.phase as "ATTEMPT" | "SUCCESS" | "FAILURE" || undefined,
    cursor: typeof params.cursor === "string" ? params.cursor : null,
  });
  if (!validated.success) return <main className="page-wrap"><h1>Invalid audit filters</h1><p role="alert">Choose an existing audit phase and valid filters.</p><Link href="/admin/audit">Clear filters</Link></main>;
  const data = await listAdminAuditEvents(validated.data);
  const next = data.nextCursor ? `/admin/audit?${new URLSearchParams({ ...filters, cursor: data.nextCursor }).toString()}` : null;
  return <AuditConsole events={data.items} nextHref={next} filters={filters} />;
}

export default function AdminAuditPage(props: PageProps<"/admin/audit">) {
  return <AdminRouteGuard><Data {...props} /></AdminRouteGuard>;
}
