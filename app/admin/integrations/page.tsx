import Link from "next/link";
import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { parseAdminPageHistory } from "@/src/components/admin/shared/admin-pagination";
import { IntegrationsConsole } from "@/src/components/admin/integrations/integrations-console";
import { AdminCursorError } from "@/src/lib/admin/cursor";
import { AdminIntegrationQuery, getAdminIntegrationsRepository } from "@/src/lib/admin/integrations/repository";

type Params = Promise<Record<string, string | string[] | undefined>>;
async function Data({ searchParams }: { searchParams: Params }) {
  const raw = await searchParams;
  const filters = Object.fromEntries(["provider", "workspaceId", "status", "expiry", "text", "cursor"].flatMap((key) => typeof raw[key] === "string" && raw[key] ? [[key, raw[key]]] : [])) as Record<string, string>;
  const parsed = AdminIntegrationQuery.safeParse(filters);
  const page = parsed.success
    ? await getAdminIntegrationsRepository().listPage(parsed.data).catch((error: unknown) => {
        if (error instanceof AdminCursorError) return null;
        throw error;
      })
    : null;
  if (!page) {
    return (
      <main className="page-wrap admin-page">
        <h1>Connected accounts</h1>
        <p className="admin-callout" role="alert">Those filters could not be used. Clear them and try again.</p>
        <Link className="button button-secondary admin-start" href="/admin/integrations">Clear filters</Link>
      </main>
    );
  }
  return <IntegrationsConsole key={JSON.stringify(filters)} items={page.items} filters={filters} nextCursor={page.nextCursor} history={parseAdminPageHistory(raw.prev)} />;
}

export default function IntegrationsPage({ searchParams }: { searchParams: Params }) {
  return <AdminRouteGuard><Data searchParams={searchParams} /></AdminRouteGuard>;
}
