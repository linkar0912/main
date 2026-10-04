import Link from "next/link";
import { AuditFilterSchema } from "@/src/lib/admin/audit/query-schema";
import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { AuditConsole } from "@/src/components/admin/audit/audit-console";
import { listAdminAuditEvents } from "@/src/lib/admin/audit/repository";
import { AdminCursorError } from "@/src/lib/admin/cursor";

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
  const data = validated.success
    ? await listAdminAuditEvents(validated.data).catch((error: unknown) => {
        if (error instanceof AdminCursorError) return null;
        throw error;
      })
    : null;
  if (!data) {
    return (
      <main className="page-wrap admin-resource-page admin-invalid-filters">
        <h1>Invalid audit filters</h1>
        <p role="alert">Invalid audit filters or page position. Clear the filters and try again.</p>
        <Link className="button button-secondary" href="/admin/audit">Clear filters</Link>
      </main>
    );
  }
  const active = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  const next = data.nextCursor ? `/admin/audit?${new URLSearchParams({ ...active, cursor: data.nextCursor }).toString()}` : null;
  return <AuditConsole events={data.items} nextHref={next} filters={filters} />;
}

export default function AdminAuditPage(props: PageProps<"/admin/audit">) {
  return <AdminRouteGuard><Data {...props} /></AdminRouteGuard>;
}
