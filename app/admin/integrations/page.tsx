import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { IntegrationsConsole } from "@/src/components/admin/integrations/integrations-console";
import { AdminIntegrationQuery, getAdminIntegrationsRepository } from "@/src/lib/admin/integrations/repository";
type Params = Promise<Record<string, string | string[] | undefined>>;
async function Data({ searchParams }: { searchParams: Params }) {
  const raw = await searchParams;
  const filters = Object.fromEntries(["provider", "workspaceId", "status", "expiry", "text", "cursor"].flatMap((key) => typeof raw[key] === "string" && raw[key] ? [[key, raw[key]]] : [])) as Record<string, string>;
  const parsed = AdminIntegrationQuery.safeParse(filters);
  if (!parsed.success) return <main className="page-wrap"><h1>Integrations</h1><p role="alert">Invalid integration filters. Clear the filters and try again.</p><a href="/admin/integrations">Clear filters</a></main>;
  const page = await getAdminIntegrationsRepository().listPage(parsed.data);
  return <IntegrationsConsole key={JSON.stringify(filters)} items={page.items} filters={filters} nextCursor={page.nextCursor} />;
}
export default function IntegrationsPage({ searchParams }: { searchParams: Params }) { return <AdminRouteGuard><Data searchParams={searchParams} /></AdminRouteGuard>; }
