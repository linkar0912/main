import { redirect } from "next/navigation";

import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { UsersScreen } from "@/src/components/admin/users-screen";
import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";
import { AdminCursorError } from "@/src/lib/admin/cursor";

type SearchParams = Promise<{ cursor?: string | string[]; search?: string | string[] }>;

async function UsersData({ searchParams }: { searchParams: SearchParams }) {
  const input = await searchParams;
  const cursor = typeof input.cursor === "string" ? input.cursor : null;
  const search = typeof input.search === "string" ? input.search : "";
  const page = await getAdminAccountsRepository().listAdminUsers({ cursor, search }).catch((error: unknown) => {
    // A stale or edited cursor restarts the listing instead of failing the page.
    if (error instanceof AdminCursorError) redirect(`/admin/users${search ? `?${new URLSearchParams({ search })}` : ""}`);
    throw error;
  });
  return <UsersScreen key={search} page={page} search={search} />;
}

export default function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  return <AdminRouteGuard><UsersData searchParams={searchParams} /></AdminRouteGuard>;
}
