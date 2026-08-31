import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { WorkspacesScreen } from "@/src/components/admin/workspaces-screen";
import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";

type SearchParams = Promise<{ cursor?: string | string[]; search?: string | string[] }>;

async function WorkspaceData({ searchParams }: { searchParams: SearchParams }) {
  const input = await searchParams;
  const cursor = typeof input.cursor === "string" ? input.cursor : null;
  const search = typeof input.search === "string" ? input.search : "";
  const page = await getAdminAccountsRepository().listAdminWorkspaces({ cursor, search });
  return <WorkspacesScreen page={page} search={search} />;
}

export default function AdminWorkspacesPage({ searchParams }: { searchParams: SearchParams }) {
  return <AdminRouteGuard><WorkspaceData searchParams={searchParams} /></AdminRouteGuard>;
}
