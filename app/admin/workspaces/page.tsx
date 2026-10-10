import { redirect } from "next/navigation";

import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { parseAdminPageHistory } from "@/src/components/admin/shared/admin-pagination";
import { WorkspacesScreen } from "@/src/components/admin/workspaces-screen";
import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";
import { AdminCursorError } from "@/src/lib/admin/cursor";

type SearchParams = Promise<{ cursor?: string | string[]; search?: string | string[]; prev?: string | string[] }>;

async function WorkspaceData({ searchParams }: { searchParams: SearchParams }) {
  const input = await searchParams;
  const cursor = typeof input.cursor === "string" ? input.cursor : null;
  const search = typeof input.search === "string" ? input.search : "";
  const page = await getAdminAccountsRepository().listAdminWorkspaces({ cursor, search }).catch((error: unknown) => {
    // A stale or edited cursor restarts the listing instead of failing the page.
    if (error instanceof AdminCursorError) redirect(`/admin/workspaces${search ? `?${new URLSearchParams({ search })}` : ""}`);
    throw error;
  });
  return <WorkspacesScreen key={search} page={page} search={search} cursor={cursor} history={parseAdminPageHistory(input.prev)} />;
}

export default function AdminWorkspacesPage({ searchParams }: { searchParams: SearchParams }) {
  return <AdminRouteGuard><WorkspaceData searchParams={searchParams} /></AdminRouteGuard>;
}
