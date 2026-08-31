import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { IntegrationsConsole } from "@/src/components/admin/integrations/integrations-console";
import { getAdminIntegrationsRepository } from "@/src/lib/admin/integrations/repository";
import type { AdminIntegrationProvider, TokenExpiryBucket } from "@/src/lib/admin/integrations/types";
type Params = Promise<Record<string, string | string[] | undefined>>;
async function Data({ searchParams }: { searchParams: Params }) { const raw = await searchParams; const one = (key: string) => typeof raw[key] === "string" ? raw[key] as string : undefined; const filters = Object.fromEntries(["provider", "workspaceId", "status", "expiry", "text"].map((key) => [key, one(key)]).filter(([, value]) => value)) as Record<string, string>; const items = await getAdminIntegrationsRepository().list({ provider: one("provider") as AdminIntegrationProvider | undefined, workspaceId: one("workspaceId"), status: one("status"), expiry: one("expiry") as TokenExpiryBucket | undefined, text: one("text") }); return <IntegrationsConsole items={items} filters={filters} />; }
export default function IntegrationsPage({ searchParams }: { searchParams: Params }) { return <AdminRouteGuard><Data searchParams={searchParams} /></AdminRouteGuard>; }
